import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { SignInForm } from './sign-in-form';

export default function SignInPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in to Cueline</CardTitle>
        <CardDescription>Use your work email and password.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SignInForm />
        <p className="text-sm text-muted-foreground">
          New here?{' '}
          <Link href="/sign-up" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
