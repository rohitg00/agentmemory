type RegisterFunction = (id: string, handler: unknown, ...rest: unknown[]) => unknown;

export function withRegistrationDefaults<T extends object>(sdk: T): T {
  return new Proxy(sdk, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      if (prop !== "registerFunction" || process.env.AGENTMEMORY_LOCAL_DISPATCH !== "false") {
        return value.bind(target);
      }
      const register = value as RegisterFunction;
      return (id: string, handler: unknown, ...rest: unknown[]) => {
        const [options, ...extra] = rest;
        const merged = { ...((options ?? {}) as object), localDispatch: false };
        return register.call(target, id, handler, merged, ...extra);
      };
    },
  });
}
