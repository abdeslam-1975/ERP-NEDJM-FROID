export function isTransientError(message: string | undefined): boolean {
  if (!message) return false;
  return /gateway timeout|timeout|timed out|503|502|504|fetch failed|network/i.test(
    message,
  );
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ignoreSlow<T>(
  thenable: PromiseLike<T> | T,
  ms = 2500,
): Promise<T | null> {
  const promise = Promise.resolve(thenable);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
