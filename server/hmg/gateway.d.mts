import type { IncomingMessage, ServerResponse } from 'node:http';
export interface GatewayConfig { siteUrl?:string; appSlug?:string; apiKey?:string; allowedOrigin?:string; development?:boolean }
export function handleWorkflow(body:unknown, token:unknown, config:GatewayConfig, fetcher?:typeof fetch):Promise<{status:number;body:Record<string,unknown>}>;
export function createWorkflowMiddleware(config:GatewayConfig,fetcher?:typeof fetch):(req:IncomingMessage,res:ServerResponse,next?:()=>void)=>Promise<void>;
export function handleCatalogue(query:URLSearchParams,config:GatewayConfig,fetcher?:typeof fetch):Promise<{status:number;body:Record<string,unknown>}>;
export function handleMaterials(query:URLSearchParams,config:GatewayConfig,fetcher?:typeof fetch):Promise<{status:number;body:Record<string,unknown>}>;
export function handleImageTicket(body:unknown,token:unknown,config:GatewayConfig,fetcher?:typeof fetch):Promise<{status:number;body?:Record<string,unknown>}>;
export function handlePrivateImage(ticket:string,now?:number):{status:number;body?:Record<string,unknown>;bytes?:Buffer;contentType?:string};
