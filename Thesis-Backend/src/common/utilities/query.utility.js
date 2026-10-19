import { get } from "../pool-manager.js";
export async function execute(query, params) { return (await get()).query(query, params); }
export default execute;
