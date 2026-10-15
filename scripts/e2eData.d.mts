export declare const PRESERVED_TABLES: readonly string[];
export declare function assertTestDatabaseUrl(connectionString: string): void;
export declare function cleanE2eData(connectionString: string, schema?: string): Promise<string[]>;
export declare function setUserStatus(
  connectionString: string,
  email: string,
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED',
  schema?: string,
): Promise<number>;
