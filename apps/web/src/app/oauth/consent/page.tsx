import { Suspense } from "react";
import ConsentForm from "./consent-form";

type ConsentPageProps = {
    searchParams: Promise<{ authorization_id?: string | string[] }>;
};

export default function ConsentPage({ searchParams }: ConsentPageProps) {
    return (
        <Suspense fallback={<p role="status">Loading account connection…</p>}>
            <ConsentRequest searchParams={searchParams} />
        </Suspense>
    );
}

async function ConsentRequest({ searchParams }: ConsentPageProps) {
    const query = await searchParams;
    const id = typeof query.authorization_id === "string" ? query.authorization_id : "";
    return <ConsentForm authorizationId={id} />;
}
