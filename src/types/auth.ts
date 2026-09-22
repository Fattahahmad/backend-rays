export interface AuthUser {
    id: number;
    email: string;
    role: 'user' | 'admin' | 'super_admin';
    name?: string;
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}
