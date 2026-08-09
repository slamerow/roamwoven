export function isSourceFactAssemblyAuthorityEnabled(
  env: {
    NODE_ENV?: string;
    SOURCE_FACT_ASSEMBLY_AUTHORITY?: string;
    SOURCE_FACT_ASSEMBLY_OFFLINE_AUDIT?: string;
  } = process.env as {
    NODE_ENV?: string;
    SOURCE_FACT_ASSEMBLY_AUTHORITY?: string;
    SOURCE_FACT_ASSEMBLY_OFFLINE_AUDIT?: string;
  }
) {
  return (
    env.NODE_ENV !== "production" &&
    env.SOURCE_FACT_ASSEMBLY_AUTHORITY === "1" &&
    env.SOURCE_FACT_ASSEMBLY_OFFLINE_AUDIT === "1"
  );
}
