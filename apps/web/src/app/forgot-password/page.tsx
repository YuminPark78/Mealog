import { AuthPageShell } from "@/components/auth-page-shell";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export default function ForgotPasswordPage() {
    return (
        <AuthPageShell>
            <ForgotPasswordForm />
        </AuthPageShell>
    );
}