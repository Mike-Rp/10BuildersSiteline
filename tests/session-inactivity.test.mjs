import test from 'node:test'
import assert from 'node:assert/strict'
import {sessionTiming,SESSION_IDLE_MS,SESSION_WARNING_MS} from '../Thesis-Backend/src/domain/session-inactivity.js'

test('idle deadline and warning use last activity, expire exactly at 30 minutes, and ignore another session metadata',()=>{
  const start=Date.UTC(2026,9,30),payload={iat:start/1000,exp:start/1000+28800,jti:'current'}
  const activity={sessionId:'current',lastActivityAt:new Date(start+3600000).toISOString()}
  const timing=sessionTiming(payload,activity,start+3600000)
  assert.equal(timing.expiresAt,start+3600000+SESSION_IDLE_MS)
  assert.equal(timing.warningAt,timing.expiresAt-SESSION_WARNING_MS)
  assert.equal(sessionTiming(payload,activity,timing.expiresAt-1).expired,false)
  assert.equal(sessionTiming(payload,activity,timing.expiresAt).expired,true)
  assert.equal(sessionTiming(payload,{...activity,sessionId:'old'},start+SESSION_IDLE_MS).expired,true)
  assert.equal(sessionTiming(payload,null,start+5*3600000).expired,true)
  assert.equal(sessionTiming(payload,{...activity,lastActivityAt:new Date(start+28700000).toISOString()},start+28800000).expired,true,'activity cannot extend the absolute eight-hour limit')
})
