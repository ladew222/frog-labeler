import Annotator from "./Annotator";

export default async function Page(
  { params }: { params: Promise<{ audioId: string }> }
) {
  const { audioId } = await params;
  return <Annotator audioId={audioId} />;
}
