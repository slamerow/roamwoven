export function isSourceFactAssemblyAuthorityEnabled(
  env: { SOURCE_FACT_ASSEMBLY_AUTHORITY?: string } = process.env as {
    SOURCE_FACT_ASSEMBLY_AUTHORITY?: string;
  }
) {
  return env.SOURCE_FACT_ASSEMBLY_AUTHORITY === "1";
}
