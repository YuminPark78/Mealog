import { AuthPageShell } from "@/components/auth-page-shell";
import { ResetPasswordForm } from "@/components/reset-password-form";

export default function ResetPasswordPage() {
    return (
        <AuthPageShell>
            <ResetPasswordForm />
        </AuthPageShell>
    );
}