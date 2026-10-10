import type { Metadata } from 'next'; import './globals.css';
export const metadata: Metadata={title:'Proof-of-Skill',description:'Evidence-backed developer assessment and skill development'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
