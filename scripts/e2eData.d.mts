export declare const PRESERVED_TABLES: readonly string[];
export declare function assertTestDatabaseUrl(connectionString: string): void;
export declare function cleanE2eData(connectionString: string, schema?: string): Promise<string[]>;
export declare function setUserStatus(
  connectionString: string,
  email: string,
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED',
  schema?: string,
): Promise<number>;
export declare function createUser(
  connectionString: string,
  user: {
    /** Email de un usuario existente, de cuyo colegio será el nuevo usuario. */
    schoolEmail: string;
    email: string;
    password: string;
    role: 'ADMIN' | 'MEMBER';
    firstName?: string;
    lastName?: string;
  },
  schema?: string,
): Promise<string>;
