import type {Metadata} from "next"; import "./globals.css"; import "./course.css";
export const metadata:Metadata={title:"Meridian CSP Explorer",description:"An interactive clinical placement constraint satisfaction simulator."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
