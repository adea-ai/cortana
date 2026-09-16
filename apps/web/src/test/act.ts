// Solid state updates flush synchronously, so the React act() wrapper reduces
// to invoking the callback (and awaiting it for the async form).
export async function act(callback?: () => unknown): Promise<void> {
  await callback?.()
}
