import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {saveEngineerExperience, validateEngineerExperience, experienceForProjectSql} from '../Thesis-Backend/src/services/accounts/experience.utility.js'

test('experience migration preserves legacy years, unknown values and unrelated metadata; month rankings remain precise',async()=>{
  const db=new PGlite()
  try {
    await db.exec('create table workspace_account_metadata(user_id text primary key,metadata jsonb not null)')
    const metadata={
      legacy:{experienceByType:{Residential:2,Commercial:0},docs:['keep-me']},
      recent:{experienceByType:{Residential:{months:6}}},
      unknown:{experienceByType:{},phone:'unchanged'},
      malformed:{experienceByType:'not-an-object'},
    }
    for(const [id,value]of Object.entries(metadata)) await db.query('insert into workspace_account_metadata values($1,$2)',[id,JSON.stringify(value)])
    const migration=await readFile(new URL('../Thesis-Backend/migrations/022-engineer-experience-months.sql',import.meta.url),'utf8')
    await db.exec(migration)
    const snapshot=async()=> (await db.query('select user_id,metadata from workspace_account_metadata order by user_id')).rows
    const first=await snapshot()
    assert.deepEqual(first.find(r=>r.user_id==='legacy').metadata,{experienceByType:{Residential:{months:24},Commercial:{months:0}},docs:['keep-me']})
    for(const id of ['recent','unknown','malformed']) assert.deepEqual(first.find(r=>r.user_id===id).metadata,metadata[id])
    await db.exec(migration)
    assert.deepEqual(await snapshot(),first,'Rerunning migration must never multiply converted months again')
    const ranked=async()=> (await db.query(`select u.id,${experienceForProjectSql('$1')} as years from (values ('legacy'),('recent'),('unknown')) as u(id) order by years desc,u.id`,['Residential'])).rows
    assert.deepEqual(await ranked(),[{id:'legacy',years:2},{id:'recent',years:0.5},{id:'unknown',years:0}])
    await saveEngineerExperience(db,'recent',validateEngineerExperience({Residential:{months:27}},'spm'))
    assert.equal((await ranked())[0].id,'recent','Backend recommendations compare months, rather than rounding to whole years')
    await saveEngineerExperience(db,'legacy',{Residential:1})
    assert.deepEqual((await snapshot()).find(r=>r.user_id==='legacy').metadata.experienceByType,{Residential:{months:12}},'Legacy API requests retain year semantics and store explicit months')
    assert.deepEqual((await snapshot()).find(r=>r.user_id==='legacy').metadata.docs,['keep-me'])
    assert.throws(()=>validateEngineerExperience({Residential:{months:6}},'client'),/only to engineer/)
    assert.throws(()=>validateEngineerExperience({Residential:{months:961}},'spm'),/whole years/)
    assert.throws(()=>experienceForProjectSql('untrusted'),/Invalid/)
  } finally {await db.close()}
})
