'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { signIn, useSession } from 'next-auth/react';

export default function Page() {
  const router = useRouter();
  const { data: session } = useSession();

  useEffect(() => {
    if (session?.user?.type === 'regular') {
      router.push('/');
    }
  }, [session, router]);

  const handleGitHubSignIn = () => {
    signIn('github', { callbackUrl: '/' });
  };

  const handleGuestSignIn = () => {
    signIn('guest', { callbackUrl: '/' });
  };

  return (
    <div className="flex h-dvh w-screen items-start pt-12 md:pt-0 md:items-center justify-center bg-background">
      <div className="w-full max-w-md overflow-hidden rounded-2xl flex flex-col gap-12">
        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center sm:px-16">
          <h3 className="text-xl font-semibold dark:text-zinc-50">Sign In</h3>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            Choose how you&apos;d like to continue
          </p>
        </div>
        <div className="flex flex-col gap-4 px-4 sm:px-16">
          <Button onClick={handleGitHubSignIn} className="w-full" size="lg">
            Continue with GitHub
          </Button>
          <Button
            onClick={handleGuestSignIn}
            variant="outline"
            className="w-full"
            size="lg"
          >
            Continue as Guest
          </Button>
        </div>
      </div>
    </div>
  );
}
