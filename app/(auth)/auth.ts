import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import { createGuestUser, upgradeGuestToGitHubUser, upgradeGuestToGoogleUser } from '@/lib/db/queries';
import { authConfig } from './auth.config';
import type { DefaultJWT } from 'next-auth/jwt';
import { cookies } from 'next/headers';

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
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile',
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
    async jwt({ token, user, account, profile }: {
      token: any;
      user: any;
      account: any;
      profile?: any;
    }) {
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
    async session({ session, token }: {
      session: any;
      token: any;
    }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.type = token.type;
      }

      return session;
    },
    async signIn({ user, account, profile }: {
      user: any;
      account: any;
      profile?: any;
    }) {
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

          // Check for guest upgrade cookie
          const cookieStore = await cookies();
          const guestUpgradeId = cookieStore.get('guest-upgrade-id')?.value;

          const githubData = {
            email: profile.email, // Can be null, that's fine
            githubId: profile.id.toString(),
            githubUsername:
              typeof profile.login === 'string' ? profile.login : '',
            avatarUrl:
              typeof profile.avatar_url === 'string' ? profile.avatar_url : '',
          };

          if (guestUpgradeId) {
            console.log(
              'Found guest upgrade cookie, attempting to upgrade user:',
              guestUpgradeId,
            );

            try {
              // Attempt to upgrade the guest user
              const upgradedUser = await upgradeGuestToGitHubUser({
                guestUserId: guestUpgradeId as string,
                githubData,
              });

              // Update user object with existing guest user ID
              user.id = upgradedUser.id;
              user.type = 'regular';

              // Clear the upgrade cookie by setting maxAge to 0
              cookieStore.set('guest-upgrade-id', '', { maxAge: 0 });

              console.log('Successfully upgraded guest user to GitHub user');
            } catch (upgradeError) {
              // If upgrade fails (e.g., GitHub account already linked), fall back to normal flow
              console.error(
                'Failed to upgrade guest user, creating new user:',
                upgradeError,
              );

              // Clear the cookie since upgrade failed by setting maxAge to 0
              cookieStore.set('guest-upgrade-id', '', { maxAge: 0 });

              const { createOrUpdateGitHubUser } = await import(
                '@/lib/db/queries'
              );
              const [dbUser] = await createOrUpdateGitHubUser(githubData);

              user.id = dbUser.id;
              user.type = 'regular';
            }
          } else {
            // Normal flow: create or update GitHub user
            const { createOrUpdateGitHubUser } = await import(
              '@/lib/db/queries'
            );

            const [dbUser] = await createOrUpdateGitHubUser(githubData);

            // Update user object with database ID
            user.id = dbUser.id;
            user.type = 'regular';
          }
        } catch (error) {
          console.error('Failed to create/update GitHub user:', error);
          return false; // Deny sign in on database error
        }
      }

      if (account?.provider === 'google' && profile) {
        try {
          console.log('Google profile data:', profile);

          // Validate required fields exist
          if (!profile.sub || !profile.picture) {
            console.error('Missing required Google profile fields:', {
              sub: !!profile.sub,
              picture: !!profile.picture,
            });
            return false;
          }

          // Check for guest upgrade cookie
          const cookieStore = await cookies();
          const guestUpgradeId = cookieStore.get('guest-upgrade-id')?.value;

          const googleData = {
            email: profile.email, // Can be null, that's fine
            googleId: profile.sub.toString(),
            googleUsername: profile.name || profile.email?.split('@')[0] || 'google-user',
            avatarUrl: profile.picture || '',
          };

          if (guestUpgradeId) {
            console.log(
              'Found guest upgrade cookie, attempting to upgrade user:',
              guestUpgradeId,
            );

            try {
              // Attempt to upgrade the guest user
              const upgradedUser = await upgradeGuestToGoogleUser({
                guestUserId: guestUpgradeId as string,
                googleData,
              });

              // Update user object with existing guest user ID
              user.id = upgradedUser.id;
              user.type = 'regular';

              // Clear the upgrade cookie by setting maxAge to 0
              cookieStore.set('guest-upgrade-id', '', { maxAge: 0 });

              console.log('Successfully upgraded guest user to Google user');
            } catch (upgradeError) {
              // If upgrade fails (e.g., Google account already linked), fall back to normal flow
              console.error(
                'Failed to upgrade guest user, creating new user:',
                upgradeError,
              );

              // Clear the cookie since upgrade failed by setting maxAge to 0
              cookieStore.set('guest-upgrade-id', '', { maxAge: 0 });

              const { createOrUpdateGoogleUser } = await import(
                '@/lib/db/queries'
              );
              const [dbUser] = await createOrUpdateGoogleUser(googleData);

              user.id = dbUser.id;
              user.type = 'regular';
            }
          } else {
            // Normal flow: create or update Google user
            const { createOrUpdateGoogleUser } = await import(
              '@/lib/db/queries'
            );

            const [dbUser] = await createOrUpdateGoogleUser(googleData);

            // Update user object with database ID
            user.id = dbUser.id;
            user.type = 'regular';
          }
        } catch (error) {
          console.error('Failed to create/update Google user:', error);
          return false; // Deny sign in on database error
        }
      }

      return true;
    },
  },
});
