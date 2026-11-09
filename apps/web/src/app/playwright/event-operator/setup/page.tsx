import { notFound } from "next/navigation";
import { SetupFixture } from "./preview";
export default async function Page({searchParams}:{searchParams:Promise<{running?:string}>}){
 if(process.env.VRDEX_ENABLE_PLAYWRIGHT_FIXTURES!=="true")notFound();
 const params=await searchParams;return <SetupFixture running={params.running==="1"}/>;
}
