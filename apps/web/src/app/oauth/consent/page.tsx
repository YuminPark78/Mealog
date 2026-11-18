import ConsentForm from "./consent-form";

export default async function ConsentPage({
    searchParams,
}: {
    searchParams: Promise<{ authorization_id?: string | string[] }>;
}) {
    const query = await searchParams;
    const id = typeof query.authorization_id === "string" ? query.authorization_id : "";
    return <ConsentForm authorizationId={id} />;
}