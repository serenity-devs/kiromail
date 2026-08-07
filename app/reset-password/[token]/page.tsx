import { ResetPasswordForm } from "@/components/password-forms";

export default async function ResetPasswordPage({params}:{params:Promise<{token:string}>}){const{token}=await params;return <ResetPasswordForm token={token}/>;}
