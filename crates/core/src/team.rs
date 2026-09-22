//! Team brain workspaces, membership, and access (`cortana.team.v1`).
//!
//! Implements the ADR 0007 membership control plane: one dedicated store per
//! workspace (marker-stamped, openable only through this control plane),
//! opaque account-id members with role-computed per-operation access, explicit
//! expiring invitations, immediate revocation by construction (no cached
//! grants), immutable residency, two-phase workspace deletion with retained
//! receipts, and stable denials that do not reveal existence. Personal stores
//! are never referenced: membership records carry account ids only.

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::store::Store;

pub const TEAM_CONTRACT: &str = "cortana.team.v1";
const REGISTRY_META_KEY: &str = "team.workspaces";
const REGISTRY_WORKSPACE_LIMIT: usize = 500;
const WORKSPACE_MARKER: &str = "team.workspace_id";
const DENIED: &str = "access denied";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum MemberRole {
    Reader,
    Contributor,
    Admin,
    Owner,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceStatus {
    Active,
    Deleting,
    Deleted,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AccessOperation {
    Read,
    Write,
    Invite,
    RemoveMember,
    ManageRoles,
    DeleteWorkspace,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemberRecord {
    pub member_id: String,
    pub role: MemberRole,
    pub joined_at: String,
    pub removed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceRecord {
    pub workspace_id: String,
    pub name: String,
    pub residency: String,
    pub status: WorkspaceStatus,
    pub store_path: String,
    pub created_at: String,
    pub members: Vec<MemberRecord>,
    pub deleted_at: Option<String>,
    pub purge_receipt_digest: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Invitation {
    pub invitation_id: String,
    pub workspace_id: String,
    pub invitee: String,
    pub role: MemberRole,
    pub invited_by: String,
    pub invited_at: String,
    pub expires_at: String,
    /// pending | accepted | revoked
    pub state: String,
}

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn load_registry(store: &Store) -> Result<Vec<WorkspaceRecord>> {
    match store.meta_get(REGISTRY_META_KEY)? {
        Some(raw) => serde_json::from_str(&raw).context("team registry is not valid JSON"),
        None => Ok(Vec::new()),
    }
}

fn save_registry(store: &Store, registry: &[WorkspaceRecord]) -> Result<()> {
    store.meta_set(REGISTRY_META_KEY, &serde_json::to_string(registry)?)
}

fn allows(role: MemberRole, operation: AccessOperation) -> bool {
    use AccessOperation::*;
    use MemberRole::*;
    match operation {
        Read => true,
        Write => role >= Contributor,
        Invite | RemoveMember => role >= Admin,
        ManageRoles | DeleteWorkspace => role == Owner,
    }
}

fn active_member<'a>(workspace: &'a WorkspaceRecord, member_id: &str) -> Option<&'a MemberRecord> {
    workspace
        .members
        .iter()
        .find(|member| member.member_id == member_id && member.removed_at.is_none())
}

/// Metadata-only team control plane; one per managed deployment.
pub struct TeamControlPlane {
    store: Store,
    registry_file: std::path::PathBuf,
}

pub struct CreateWorkspaceRequest {
    pub name: String,
    pub residency: String,
    pub store_path: std::path::PathBuf,
    pub owner_member_id: String,
}

impl TeamControlPlane {
    pub fn open(path: &std::path::Path) -> Result<Self> {
        Ok(Self {
            store: Store::open(path)?,
            registry_file: path.to_path_buf(),
        })
    }

    /// Create a workspace with the creator as owner. Residency is pinned here
    /// and is immutable for the workspace's lifetime.
    pub fn create_workspace(&self, request: &CreateWorkspaceRequest) -> Result<WorkspaceRecord> {
        if request.name.trim().is_empty() {
            bail!("workspace name cannot be empty");
        }
        if request.owner_member_id.trim().is_empty() {
            bail!("owner member id cannot be empty");
        }
        // A purge destroys the workspace directory recursively; refuse any
        // placement that would contain the control-plane registry itself.
        if self.registry_file.starts_with(&request.store_path) {
            bail!("workspace data plane cannot contain the control-plane registry");
        }
        let mut registry = load_registry(&self.store)?;
        if registry.len() >= REGISTRY_WORKSPACE_LIMIT {
            bail!("workspace limit of {REGISTRY_WORKSPACE_LIMIT} reached");
        }
        if registry
            .iter()
            .any(|workspace| workspace.store_path == request.store_path.to_string_lossy())
        {
            bail!("store path is already registered to a workspace");
        }
        std::fs::create_dir_all(&request.store_path).with_context(|| {
            format!(
                "failed to create workspace data plane at {}",
                request.store_path.display()
            )
        })?;
        let store = Store::open(&request.store_path.join("store.sqlite3"))?;
        let workspace_id = uuid::Uuid::new_v4().to_string();
        store.meta_set(WORKSPACE_MARKER, &workspace_id)?;
        let record = WorkspaceRecord {
            workspace_id: workspace_id.clone(),
            name: request.name.trim().to_string(),
            residency: request.residency.trim().to_string(),
            status: WorkspaceStatus::Active,
            store_path: request.store_path.to_string_lossy().to_string(),
            created_at: now_rfc3339(),
            members: vec![MemberRecord {
                member_id: request.owner_member_id.clone(),
                role: MemberRole::Owner,
                joined_at: now_rfc3339(),
                removed_at: None,
            }],
            deleted_at: None,
            purge_receipt_digest: None,
        };
        registry.push(record.clone());
        save_registry(&self.store, &registry)?;
        Ok(record)
    }

    pub fn list(&self) -> Result<Vec<WorkspaceRecord>> {
        load_registry(&self.store)
    }

    fn workspace_mut<'a>(
        registry: &'a mut [WorkspaceRecord],
        workspace_id: &str,
    ) -> Result<&'a mut WorkspaceRecord> {
        registry
            .iter_mut()
            .find(|workspace| workspace.workspace_id == workspace_id)
            .ok_or_else(|| anyhow::anyhow!("unknown workspace {workspace_id}"))
    }

    fn authorize_workspace(
        workspace: &WorkspaceRecord,
        member_id: &str,
        operation: AccessOperation,
    ) -> Result<MemberRole> {
        let Some(member) = active_member(workspace, member_id) else {
            bail!("{DENIED}");
        };
        if workspace.status != WorkspaceStatus::Active {
            // While deletion intent exists only the owner's delete operation
            // still passes, so the two-phase flow can complete.
            let owner_confirming =
                operation == AccessOperation::DeleteWorkspace && member.role == MemberRole::Owner;
            if !owner_confirming {
                bail!("{DENIED}");
            }
            return Ok(member.role);
        }
        if allows(member.role, operation) {
            Ok(member.role)
        } else {
            bail!("{DENIED}")
        }
    }

    /// Compute whether a member may perform an operation. Stable denial
    /// without revealing whether the workspace or membership exists.
    pub fn authorize(
        &self,
        workspace_id: &str,
        member_id: &str,
        operation: AccessOperation,
    ) -> Result<()> {
        let registry = load_registry(&self.store)?;
        let Some(workspace) = registry
            .iter()
            .find(|workspace| workspace.workspace_id == workspace_id)
        else {
            bail!("{DENIED}");
        };
        Self::authorize_workspace(workspace, member_id, operation).map(|_| ())
    }

    /// The member's effective role and allowed operations: the access
    /// explanation surfaced to admin and member UX.
    pub fn access_explanation(&self, workspace_id: &str, member_id: &str) -> Result<Value> {
        let registry = load_registry(&self.store)?;
        let Some(workspace) = registry
            .iter()
            .find(|workspace| workspace.workspace_id == workspace_id)
        else {
            bail!("{DENIED}");
        };
        let role = Self::authorize_workspace(workspace, member_id, AccessOperation::Read)?;
        let operations = [
            AccessOperation::Read,
            AccessOperation::Write,
            AccessOperation::Invite,
            AccessOperation::RemoveMember,
            AccessOperation::ManageRoles,
            AccessOperation::DeleteWorkspace,
        ]
        .iter()
        .filter(|operation| allows(role, **operation))
        .map(|operation| serde_json::to_value(operation).unwrap_or_default())
        .collect::<Vec<_>>();
        Ok(json!({
            "workspace_id": workspace_id,
            "member_id": member_id,
            "role": serde_json::to_value(role)?,
            "allowed_operations": operations,
            "residency": workspace.residency,
        }))
    }

    /// Invite one member id at one role. Admin or above; owners are made only
    /// at creation; duplicate active membership or a duplicate pending
    /// invitation for the same invitee is rejected.
    pub fn invite(
        &self,
        workspace_id: &str,
        actor: &str,
        invitee: &str,
        role: MemberRole,
        ttl_seconds: i64,
    ) -> Result<Invitation> {
        if role == MemberRole::Owner {
            bail!("owners are made at workspace creation, not by invitation");
        }
        let mut registry = load_registry(&self.store)?;
        let workspace = Self::workspace_mut(&mut registry, workspace_id)?;
        Self::authorize_workspace(workspace, actor, AccessOperation::Invite)?;
        if active_member(workspace, invitee).is_some() {
            bail!("member {invitee} is already active");
        }
        let now = chrono::Utc::now();
        let invitation = Invitation {
            invitation_id: uuid::Uuid::new_v4().to_string(),
            workspace_id: workspace_id.to_string(),
            invitee: invitee.to_string(),
            role,
            invited_by: actor.to_string(),
            invited_at: now.to_rfc3339(),
            expires_at: (now + chrono::Duration::seconds(ttl_seconds)).to_rfc3339(),
            state: "pending".into(),
        };
        let mut pending = self.load_invitations()?;
        if pending.iter().any(|existing| {
            existing.workspace_id == workspace_id
                && existing.invitee == invitee
                && existing.state == "pending"
        }) {
            bail!("an invitation for {invitee} is already pending");
        }
        pending.push(invitation.clone());
        self.save_invitations(&pending)?;
        Ok(invitation)
    }

    fn load_invitations(&self) -> Result<Vec<Invitation>> {
        match self.store.meta_get("team.invitations")? {
            Some(raw) => serde_json::from_str(&raw).context("invitations are not valid JSON"),
            None => Ok(Vec::new()),
        }
    }

    fn save_invitations(&self, invitations: &[Invitation]) -> Result<()> {
        self.store
            .meta_set("team.invitations", &serde_json::to_string(invitations)?)
    }

    /// Accept an invitation as the invitee only; expired or non-pending
    /// invitations are rejected. Membership takes effect immediately.
    pub fn accept_invitation(&self, invitation_id: &str, acceptor: &str) -> Result<MemberRecord> {
        let mut invitations = self.load_invitations()?;
        let invitation = invitations
            .iter_mut()
            .find(|invitation| invitation.invitation_id == invitation_id)
            .ok_or_else(|| anyhow::anyhow!("unknown invitation {invitation_id}"))?;
        if invitation.state != "pending" {
            bail!("invitation is {}", invitation.state);
        }
        if invitation.invitee != acceptor {
            bail!("{DENIED}");
        }
        let expires_at = chrono::DateTime::parse_from_rfc3339(&invitation.expires_at)
            .context("invitation expiry is not a valid timestamp")?
            .with_timezone(&chrono::Utc);
        let expired = chrono::Utc::now() >= expires_at;
        let (workspace_id, role) = (invitation.workspace_id.clone(), invitation.role);
        let invitation = invitations
            .iter_mut()
            .find(|invitation| invitation.invitation_id == invitation_id)
            .expect("invitation looked up above");
        invitation.state = if expired {
            "expired".into()
        } else {
            "accepted".into()
        };
        let expires_at = invitation.expires_at.clone();
        self.save_invitations(&invitations)?;
        if expired {
            bail!("invitation expired at {expires_at}");
        }

        let mut registry = load_registry(&self.store)?;
        let workspace = Self::workspace_mut(&mut registry, &workspace_id)?;
        if workspace.status != WorkspaceStatus::Active {
            bail!("workspace is not accepting members");
        }
        if active_member(workspace, acceptor).is_some() {
            bail!("member {acceptor} is already active");
        }
        let member = MemberRecord {
            member_id: acceptor.to_string(),
            role,
            joined_at: now_rfc3339(),
            removed_at: None,
        };
        workspace.members.push(member.clone());
        save_registry(&self.store, &registry)?;
        Ok(member)
    }

    /// Revoke a pending invitation; admin or above.
    pub fn revoke_invitation(&self, invitation_id: &str, actor: &str) -> Result<Invitation> {
        let mut invitations = self.load_invitations()?;
        let invitation = invitations
            .iter_mut()
            .find(|invitation| invitation.invitation_id == invitation_id)
            .ok_or_else(|| anyhow::anyhow!("unknown invitation {invitation_id}"))?;
        let registry = load_registry(&self.store)?;
        let workspace = registry
            .iter()
            .find(|workspace| workspace.workspace_id == invitation.workspace_id)
            .ok_or_else(|| anyhow::anyhow!("unknown workspace"))?;
        Self::authorize_workspace(workspace, actor, AccessOperation::Invite)?;
        if invitation.state != "pending" {
            bail!("invitation is {}", invitation.state);
        }
        invitation.state = "revoked".into();
        let invitation = invitation.clone();
        self.save_invitations(&invitations)?;
        Ok(invitation)
    }

    /// Remove a member (admin or above). Owners can only be removed through
    /// workspace deletion. Removal takes effect at the next authorization
    /// check because no cached grant exists.
    pub fn remove_member(
        &self,
        workspace_id: &str,
        actor: &str,
        target: &str,
    ) -> Result<MemberRecord> {
        let mut registry = load_registry(&self.store)?;
        let workspace = Self::workspace_mut(&mut registry, workspace_id)?;
        let actor_role =
            Self::authorize_workspace(workspace, actor, AccessOperation::RemoveMember)?;
        let Some(index) = workspace
            .members
            .iter()
            .position(|member| member.member_id == target && member.removed_at.is_none())
        else {
            bail!("{DENIED}");
        };
        let member = &mut workspace.members[index];
        if member.role == MemberRole::Owner {
            bail!("owners are removed only through workspace deletion");
        }
        if actor_role != MemberRole::Owner && member.role >= actor_role {
            bail!("{DENIED}");
        }
        member.removed_at = Some(now_rfc3339());
        let member = member.clone();
        save_registry(&self.store, &registry)?;
        Ok(member)
    }

    /// Voluntary departure for non-owner members.
    pub fn leave(&self, workspace_id: &str, member_id: &str) -> Result<MemberRecord> {
        let mut registry = load_registry(&self.store)?;
        let workspace = Self::workspace_mut(&mut registry, workspace_id)?;
        let Some(index) = workspace
            .members
            .iter()
            .position(|member| member.member_id == member_id && member.removed_at.is_none())
        else {
            bail!("{DENIED}");
        };
        let member = &mut workspace.members[index];
        if member.role == MemberRole::Owner {
            bail!("the owner leaves only through workspace deletion");
        }
        member.removed_at = Some(now_rfc3339());
        let member = member.clone();
        save_registry(&self.store, &registry)?;
        Ok(member)
    }

    /// Open a workspace data plane; requires Read and verifies the marker.
    pub fn open_workspace(&self, workspace_id: &str, member_id: &str) -> Result<Store> {
        let registry = load_registry(&self.store)?;
        let workspace = registry
            .iter()
            .find(|workspace| workspace.workspace_id == workspace_id)
            .ok_or_else(|| anyhow::anyhow!("{DENIED}"))?;
        Self::authorize_workspace(workspace, member_id, AccessOperation::Read)?;
        let store =
            Store::open(&std::path::Path::new(&workspace.store_path).join("store.sqlite3"))?;
        let marker = store.meta_get(WORKSPACE_MARKER)?;
        if marker.as_deref() != Some(workspace_id) {
            bail!("workspace data plane marker does not match the registry");
        }
        Ok(store)
    }

    /// Record deletion intent; owner only.
    pub fn request_delete(&self, workspace_id: &str, actor: &str) -> Result<WorkspaceRecord> {
        let mut registry = load_registry(&self.store)?;
        let workspace = Self::workspace_mut(&mut registry, workspace_id)?;
        Self::authorize_workspace(workspace, actor, AccessOperation::DeleteWorkspace)?;
        workspace.status = WorkspaceStatus::Deleting;
        let workspace = workspace.clone();
        save_registry(&self.store, &registry)?;
        Ok(workspace)
    }

    /// Destroy the workspace data plane and retain a purge receipt. Owner
    /// only; confirmation must repeat the workspace id exactly. Member
    /// records stay in the registry for audit; personal stores are untouched
    /// because this control plane never knows them.
    pub fn confirm_delete(
        &self,
        workspace_id: &str,
        actor: &str,
        confirmation: &str,
    ) -> Result<WorkspaceRecord> {
        if confirmation != workspace_id {
            bail!("deletion confirmation must repeat the workspace id exactly");
        }
        let mut registry = load_registry(&self.store)?;
        let workspace = Self::workspace_mut(&mut registry, workspace_id)?;
        Self::authorize_workspace(workspace, actor, AccessOperation::DeleteWorkspace)?;
        if workspace.status != WorkspaceStatus::Deleting {
            bail!("workspace {workspace_id} has no recorded deletion intent");
        }
        let store_path = std::path::Path::new(&workspace.store_path);
        if store_path.exists() {
            std::fs::remove_dir_all(store_path).with_context(|| {
                format!("failed to destroy data plane at {}", workspace.store_path)
            })?;
        }
        let deleted_at = now_rfc3339();
        let mut hasher = Sha256::new();
        hasher.update(b"cortana.team.workspace-delete.v1");
        hasher.update(workspace_id.as_bytes());
        hasher.update(deleted_at.as_bytes());
        hasher.update(workspace.store_path.as_bytes());
        let digest_bytes = hasher.finalize();
        let mut digest = String::with_capacity(digest_bytes.len() * 2);
        for byte in digest_bytes {
            use std::fmt::Write as _;
            write!(digest, "{byte:02x}").expect("formatting cannot fail");
        }
        workspace.status = WorkspaceStatus::Deleted;
        workspace.deleted_at = Some(deleted_at);
        workspace.purge_receipt_digest = Some(format!("sha256:{digest}"));
        let workspace = workspace.clone();
        save_registry(&self.store, &registry)?;
        Ok(workspace)
    }

    /// JSON snapshot of workspace lifecycle counts; content never appears.
    pub fn status(&self) -> Result<Value> {
        let registry = load_registry(&self.store)?;
        let counts = [
            WorkspaceStatus::Active,
            WorkspaceStatus::Deleting,
            WorkspaceStatus::Deleted,
        ]
        .into_iter()
        .map(|status| {
            (
                serde_json::to_value(status).unwrap_or_default(),
                registry
                    .iter()
                    .filter(|workspace| workspace.status == status)
                    .count(),
            )
        })
        .collect::<Vec<_>>();
        Ok(json!({
            "contract_version": TEAM_CONTRACT,
            "workspaces": registry.len(),
            "by_status": counts,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tempfile::tempdir;

    struct Fixture {
        _guard: tempfile::TempDir,
        control: TeamControlPlane,
        workspace: WorkspaceRecord,
        owner: String,
        member_b: String,
        member_c: String,
        personal_b: PathBuf,
    }

    fn control_plane() -> Fixture {
        let guard = tempdir().expect("temp dir");
        let control =
            TeamControlPlane::open(&guard.path().join("team-control.sqlite3")).expect("open");
        let owner = "account-owner".to_string();
        let member_b = "account-b".to_string();
        let member_c = "account-c".to_string();
        let workspace = control
            .create_workspace(&CreateWorkspaceRequest {
                name: "platform".into(),
                residency: "eu-central".into(),
                store_path: guard.path().join("workspaces").join("platform"),
                owner_member_id: owner.clone(),
            })
            .expect("create workspace");
        // A member personal store the team control plane never references.
        let personal_b = guard.path().join("personal-b.sqlite3");
        Store::open(&personal_b).expect("personal store");
        Fixture {
            _guard: guard,
            control,
            workspace,
            owner,
            member_b,
            member_c,
            personal_b,
        }
    }

    fn invite_and_accept(
        fixture: &Fixture,
        actor: &str,
        invitee: &str,
        role: MemberRole,
    ) -> MemberRecord {
        let invitation = fixture
            .control
            .invite(&fixture.workspace.workspace_id, actor, invitee, role, 3600)
            .expect("invite");
        fixture
            .control
            .accept_invitation(&invitation.invitation_id, invitee)
            .expect("accept")
    }

    #[test]
    fn revocation_permanently_blocks_the_invitation() {
        let fixture = control_plane();
        let invitation = fixture
            .control
            .invite(
                &fixture.workspace.workspace_id,
                &fixture.owner,
                &fixture.member_b,
                MemberRole::Contributor,
                3600,
            )
            .expect("invite");

        let revoked = fixture
            .control
            .revoke_invitation(&invitation.invitation_id, &fixture.owner)
            .expect("revoke");
        assert_eq!(revoked.state, "revoked");

        // The invitee can no longer accept a revoked invitation.
        assert!(
            fixture
                .control
                .accept_invitation(&invitation.invitation_id, &fixture.member_b)
                .is_err()
        );
        // Re-revoking fails: the invitation is no longer pending.
        assert!(
            fixture
                .control
                .revoke_invitation(&invitation.invitation_id, &fixture.owner)
                .is_err()
        );
    }

    #[test]
    fn membership_lifecycle_enforces_the_role_matrix() {
        let fixture = control_plane();
        let workspace_id = &fixture.workspace.workspace_id;
        assert!(fixture.workspace.residency == "eu-central");

        invite_and_accept(
            &fixture,
            &fixture.owner,
            &fixture.member_b,
            MemberRole::Contributor,
        );
        // Contributor writes, cannot invite or manage.
        assert!(
            fixture
                .control
                .authorize(workspace_id, &fixture.member_b, AccessOperation::Write)
                .is_ok()
        );
        assert!(
            fixture
                .control
                .authorize(workspace_id, &fixture.member_b, AccessOperation::Invite)
                .is_err()
        );
        assert!(
            fixture
                .control
                .authorize(
                    workspace_id,
                    &fixture.member_b,
                    AccessOperation::ManageRoles
                )
                .is_err()
        );
        // Reader via B? No — invitations require admin; contributor cannot invite.
        assert!(
            fixture
                .control
                .invite(
                    workspace_id,
                    &fixture.member_b,
                    &fixture.member_c,
                    MemberRole::Reader,
                    60
                )
                .is_err()
        );
        // Owner invites C as reader.
        invite_and_accept(
            &fixture,
            &fixture.owner,
            &fixture.member_c,
            MemberRole::Reader,
        );
        assert!(
            fixture
                .control
                .authorize(workspace_id, &fixture.member_c, AccessOperation::Read)
                .is_ok()
        );
        assert!(
            fixture
                .control
                .authorize(workspace_id, &fixture.member_c, AccessOperation::Write)
                .is_err()
        );

        // Owner removes C; B (contributor) cannot remove anyone.
        fixture
            .control
            .remove_member(workspace_id, &fixture.owner, &fixture.member_c)
            .expect("owner removes reader");
        assert!(
            fixture
                .control
                .authorize(workspace_id, &fixture.member_c, AccessOperation::Read)
                .is_err()
        );
        assert!(
            fixture
                .control
                .remove_member(workspace_id, &fixture.member_b, &fixture.owner)
                .is_err()
        );

        // Residency never moved.
        let listed = fixture.control.list().expect("list");
        assert_eq!(listed[0].residency, "eu-central");

        // Access explanation matches the contributor role.
        let explanation = fixture
            .control
            .access_explanation(workspace_id, &fixture.member_b)
            .expect("explanation");
        assert_eq!(explanation["role"], serde_json::json!("contributor"));
        assert!(
            explanation["allowed_operations"]
                .as_array()
                .expect("operations")
                .contains(&serde_json::json!("write"))
        );
    }

    #[test]
    fn invitations_are_expiring_single_recipient_objects() {
        let fixture = control_plane();
        let workspace_id = &fixture.workspace.workspace_id;
        let first = fixture
            .control
            .invite(
                workspace_id,
                &fixture.owner,
                &fixture.member_b,
                MemberRole::Contributor,
                3600,
            )
            .expect("invite");
        assert!(
            fixture
                .control
                .invite(
                    workspace_id,
                    &fixture.owner,
                    &fixture.member_b,
                    MemberRole::Reader,
                    3600
                )
                .is_err(),
            "duplicate pending invitation must be rejected"
        );
        // Only the invitee accepts.
        assert!(
            fixture
                .control
                .accept_invitation(&first.invitation_id, &fixture.member_c)
                .is_err()
        );
        fixture
            .control
            .accept_invitation(&first.invitation_id, &fixture.member_b)
            .expect("accept");
        assert!(
            fixture
                .control
                .accept_invitation(&first.invitation_id, &fixture.member_b)
                .is_err(),
            "accepted invitations cannot be replayed"
        );

        // Expired invitations are rejected and marked.
        let expired = fixture
            .control
            .invite(
                workspace_id,
                &fixture.owner,
                &fixture.member_c,
                MemberRole::Reader,
                0,
            )
            .expect("invite");
        std::thread::sleep(std::time::Duration::from_millis(5));
        assert!(
            fixture
                .control
                .accept_invitation(&expired.invitation_id, &fixture.member_c)
                .is_err()
        );
    }

    #[test]
    fn removal_takes_effect_immediately_and_owner_is_protected() {
        let fixture = control_plane();
        let workspace_id = &fixture.workspace.workspace_id;
        invite_and_accept(
            &fixture,
            &fixture.owner,
            &fixture.member_b,
            MemberRole::Contributor,
        );
        assert!(
            fixture
                .control
                .open_workspace(workspace_id, &fixture.member_b)
                .is_ok()
        );
        fixture
            .control
            .remove_member(workspace_id, &fixture.owner, &fixture.member_b)
            .expect("remove");
        assert!(
            fixture
                .control
                .open_workspace(workspace_id, &fixture.member_b)
                .is_err(),
            "removed members lose access at the next check"
        );
        assert!(fixture.control.leave(workspace_id, &fixture.owner).is_err());
    }

    #[test]
    fn workspace_deletion_is_two_phase_and_spares_personal_stores() {
        let fixture = control_plane();
        let workspace_id = &fixture.workspace.workspace_id;
        invite_and_accept(
            &fixture,
            &fixture.owner,
            &fixture.member_b,
            MemberRole::Contributor,
        );
        // Wrong confirmation and missing intent both fail.
        assert!(
            fixture
                .control
                .confirm_delete(workspace_id, &fixture.owner, "wrong")
                .is_err()
        );
        assert!(
            fixture
                .control
                .confirm_delete(workspace_id, &fixture.owner, workspace_id)
                .is_err()
        );
        fixture
            .control
            .request_delete(workspace_id, &fixture.owner)
            .expect("intent");
        // Even members lose access the moment deletion intent exists.
        assert!(
            fixture
                .control
                .authorize(workspace_id, &fixture.member_b, AccessOperation::Read)
                .is_err()
        );
        let deleted = fixture
            .control
            .confirm_delete(workspace_id, &fixture.owner, workspace_id)
            .expect("delete");
        assert_eq!(deleted.status, WorkspaceStatus::Deleted);
        assert!(deleted.purge_receipt_digest.is_some());
        assert!(!std::path::Path::new(&deleted.store_path).exists());
        // The member's personal store is untouched by construction.
        assert!(fixture.personal_b.exists());
    }

    #[test]
    fn swapped_workspace_marker_is_detected() {
        let fixture = control_plane();
        let other = fixture
            .control
            .create_workspace(&CreateWorkspaceRequest {
                name: "other".into(),
                residency: "us-east".into(),
                store_path: fixture._guard.path().join("workspaces").join("other"),
                owner_member_id: fixture.owner.clone(),
            })
            .expect("create other");
        let data_plane =
            Store::open(&std::path::Path::new(&fixture.workspace.store_path).join("store.sqlite3"))
                .expect("open");
        data_plane
            .meta_set(WORKSPACE_MARKER, &other.workspace_id)
            .expect("swap");
        assert!(
            fixture
                .control
                .open_workspace(&fixture.workspace.workspace_id, &fixture.owner)
                .is_err()
        );
    }

    #[test]
    fn status_is_content_free() {
        let fixture = control_plane();
        let status = fixture.control.status().expect("status");
        assert_eq!(status["contract_version"], TEAM_CONTRACT);
        let serialized = status.to_string();
        assert!(!serialized.contains("store_path"));
        assert!(!serialized.contains("account-"));
    }
}
