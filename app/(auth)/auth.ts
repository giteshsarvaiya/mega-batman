import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import { createGuestUser } from '@/lib/db/queries';
import { authConfig } from './auth.config';
import type { DefaultJWT } from 'next-auth/jwt';

export type UserType = 'guest' | 'regular';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: {
      id: string;
      type: UserType;
    } & DefaultSession['user'];
  }

  interface User {
    id?: string;
    email?: string | null;
    type: UserType;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    type: UserType;
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: [
    GitHub({
      // biome-ignore lint/style/noNonNullAssertion: Required environment variables
      clientId: process.env.GITHUB_CLIENT_ID!,
      // biome-ignore lint/style/noNonNullAssertion: Required environment variables
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'read:user user:email',
        },
      },
    }),
    Credentials({
      id: 'guest',
      credentials: {},
      async authorize() {
        const [guestUser] = await createGuestUser();
        return { ...guestUser, type: 'guest' };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (user) {
        token.id = user.id as string;
        token.type =
          user.type || (account?.provider === 'github' ? 'regular' : 'guest');
      }

      // Store GitHub profile data in token for first login
      if (account?.provider === 'github' && profile) {
        token.githubId = profile.id?.toString();
        token.avatarUrl = profile.avatar_url;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.type = token.type;
      }

      return session;
    },
    async signIn({ user, account, profile }) {
      if (account?.provider === 'github' && profile) {
        try {
          console.log('GitHub profile data:', profile);

          // Validate required fields exist
          if (!profile.id || !profile.avatar_url) {
            console.error('Missing required GitHub profile fields:', {
              id: !!profile.id,
              avatar_url: !!profile.avatar_url,
            });
            return false;
          }

          // Create or update user with GitHub data
          const { createOrUpdateGitHubUser } = await import('@/lib/db/queries');

          const [dbUser] = await createOrUpdateGitHubUser({
            email: profile.email, // Can be null, that's fine
            githubId: profile.id.toString(),
            githubUsername: typeof profile.login === 'string' ? profile.login : '',
            avatarUrl: typeof profile.avatar_url === 'string' ? profile.avatar_url : '',
          });

          // Update user object with database ID
          user.id = dbUser.id;
          user.type = 'regular';
        } catch (error) {
          console.error('Failed to create/update GitHub user:', error);
          return false; // Deny sign in on database error
        }
      }

      return true;
    },
  },
});
