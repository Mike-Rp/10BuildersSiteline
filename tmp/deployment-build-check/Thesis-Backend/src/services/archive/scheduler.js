import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { errorlog } from "../../common/utilities/logger.utility.js";
import { sweepArchive } from "./policy.js";
import { sweepLicenses } from "../licenses/sweep.js";

export function startArchiveMaintenance() {
  if(process.env.ARCHIVE_MAINTENANCE_ENABLED==="false") return ()=>{};
  let running=false;
  const timer=setInterval(async()=>{
    if(running) return;
    running=true;
    try {await withTransaction(db=>sweepArchive(db));}
    catch(error) {errorlog(error);}
    try {await withTransaction(db=>sweepLicenses(db));}
    catch(error) {errorlog(error);}
    finally {running=false;}
  },15*60*1000);
  timer.unref();
  return ()=>clearInterval(timer);
}
