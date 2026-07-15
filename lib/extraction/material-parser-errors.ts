export class MaterialParserError extends Error {
  constructor(
    message: string,
    public readonly failureClass: string,
    public readonly metadata: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "MaterialParserError";
  }
}
