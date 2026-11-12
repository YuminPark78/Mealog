import type { ReactNode } from "react";

type Props = {
    children: ReactNode;
};

export function AuthPageShell({ children }: Props) {
    return (
        <main className="flex min-h-svh w-full flex-1 items-center justify-center bg-background px-5 py-10 text-foreground">
            <div className="w-full max-w-sm">
                {children}
            </div>
        </main>
    );
}