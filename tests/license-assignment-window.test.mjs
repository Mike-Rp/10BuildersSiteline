import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { assertEligibleManager, getLicenseEligibility } from '../Thesis-Backend/src/common/utilities/license-eligibility.utility.js'

test('backend blocks new OPM/SPM assignments through day 30 and allows day 31', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create table roles(id int, code text);
      create table users(id int, role_id int, status text, is_deleted boolean);
      create table workspace_account_metadata(user_id int, metadata jsonb);
      create table user_licenses(id int, user_id int, superseded_at timestamp, upload_status text, upload_file_ref text, license_expiry date, created_at timestamp);
      insert into roles values(1,'opm'),(2,'spm');
      insert into users values(1,1,'active',false),(2,2,'active',false);
      insert into user_licenses values(1,1,null,'uploaded','license.pdf',current_date+400,now()),(2,2,null,'uploaded','license.pdf',current_date+400,now());`)
    for (const [id, role] of [[1,'opm'],[2,'spm']]) {
      for (const days of [-1,0,1,29,30,31,60]) {
        await db.query(`update user_licenses set license_expiry=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date+$1::int where user_id=$2`,[days,id])
        const info = await getLicenseEligibility(id, (sql,args)=>db.query(sql,args))
        assert.equal(info.eligible_for_new_assignment,days>30)
        if(days>30) await assertEligibleManager(db,id,role)
        else await assert.rejects(assertEligibleManager(db,id,role), {status:422})
      }
    }
  } finally { await db.close() }
})

 test("replacement trigger includes the 30-day boundary and pending renewals", async () => {
 const { computeLicenseStatus, needsLicenseReplacement, addDays } = await import("../Thesis-Backend/src/common/utilities/license-status.utility.js")
 for (const days of [-40,-1,0,29,30,31,33,34]) {
  const state = computeLicenseStatus({ today: "2026-10-29", expiry: addDays("2026-10-29",days), renewalOpen: true })
  assert.equal(needsLicenseReplacement(state), days <= 33)
 }
 assert.equal(needsLicenseReplacement(computeLicenseStatus({})), false)
})

 test('company access boundaries and Manila dates', async () => {
 const {licenseAccessPolicy: policy,licensePolicyDay} = await import('../Thesis-Backend/src/domain/license-access.js')
 const expiry='2026-12-03'
 for(const [day,mode] of [['2026-10-30','normal'],['2026-10-31','normal'],['2026-11-03','view_only'],['2026-11-09','view_only'],['2026-11-10','disabled'],['2026-12-04','disabled']]) assert.equal(policy(expiry,day).mode,mode)
 assert.equal(policy(expiry,'2026-10-31').prepareReplacement,true)
 assert.equal(policy(expiry,'2026-10-30').prepareReplacement,false)
 assert.equal(policy(expiry,'2026-11-03').viewingDaysLeft,7)
 assert.equal(policy(expiry,'2026-11-09').viewingDaysLeft,1)
 assert.equal(licensePolicyDay(new Date('2026-10-29T16:01:00Z')),'2026-10-30')
})
