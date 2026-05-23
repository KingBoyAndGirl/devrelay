import type { NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GitHubProvider from 'next-auth/providers/github';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { createId } from '@paralleldrive/cuid2';
import { config } from '@/lib/config';

export const auth = () => getServerSession(authOptions);

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: '用户名', type: 'text' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const username = (credentials.username as string).toLowerCase();
        const password = credentials.password as string;

        const user = await db.query.users.findFirst({
          where: eq(users.username, username),
        });

        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.displayName || user.username,
          email: user.username,
        };
      },
    }),
    ...(config.github.clientId ? [GitHubProvider({
      clientId: config.github.clientId,
      clientSecret: config.github.clientSecret,
    })] : []),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'github') {
        // Auto-create user on first GitHub login
        const githubName = (profile as any)?.login || user.name || user.email?.split('@')[0] || 'github-user';
        const username = githubName.toLowerCase();

        let existing = await db.query.users.findFirst({
          where: eq(users.username, username),
        });

        if (!existing) {
          const now = new Date().toISOString();
          await db.insert(users).values({
            id: createId(),
            username,
            passwordHash: '', // GitHub login only
            displayName: user.name || githubName,
            isAdmin: false,
            createdAt: now,
            updatedAt: now,
          });
          existing = await db.query.users.findFirst({
            where: eq(users.username, username),
          });
        }

        if (existing) {
          user.id = existing.id;
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.userId;
      }
      return session;
    },
  },
};

export async function ensureAdminUser() {
  const existing = await db.query.users.findFirst({
    where: eq(users.username, config.adminUser.toLowerCase()),
  });

  if (existing) return;

  const hash = await bcrypt.hash(config.adminPass, 12);
  const now = new Date().toISOString();

  await db.insert(users).values({
    id: createId(),
    username: config.adminUser.toLowerCase(),
    passwordHash: hash,
    displayName: '管理员',
    isAdmin: true,
    createdAt: now,
    updatedAt: now,
  });

  console.log(`[devrelay] Admin user created: ${config.adminUser}`);
}
