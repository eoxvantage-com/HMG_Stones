import { createServer } from 'node:http';
import { createWorkflowMiddleware } from './gateway.mjs';

// Deploy behind the SAME trusted origin as the frontend. This is API-only, not a static file server.
const allowedOrigin=process.env.HMG_ALLOWED_ORIGIN;
if(!allowedOrigin || new URL(allowedOrigin).protocol!=='https:' || new URL(allowedOrigin).origin!==allowedOrigin)
  throw new Error('Set HMG_ALLOWED_ORIGIN to the exact HTTPS frontend origin.');
if(!process.env.TARUVI_API_KEY)throw new Error('Set the server-only TARUVI_API_KEY.');
const handler=createWorkflowMiddleware({siteUrl:process.env.TARUVI_SITE_URL,appSlug:process.env.TARUVI_APP_SLUG,apiKey:process.env.TARUVI_API_KEY,allowedOrigin});
const port=Number(process.env.HMG_GATEWAY_PORT||8787);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid gateway port.');
const server=createServer((req,res)=>{void handler(req,res);});
server.requestTimeout=15000;server.headersTimeout=10000;server.maxHeadersCount=40;
server.listen(port,'127.0.0.1',()=>process.stdout.write(`HMG gateway listening on loopback port ${port}; same-origin reverse proxy required.\n`));
