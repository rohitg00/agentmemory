declare module "@xenova/transformers" {
  export function pipeline(task: string, model: string): Promise<any>;
}
