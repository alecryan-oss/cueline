import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { SignUpForm } from './sign-up-form';

export default function SignUpPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your Cueline account</CardTitle>
        <CardDescription>You&apos;ll get a workspace right after signing up.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SignUpForm />
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/sign-in" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
