# SITELINE — Source Index

Companion to `SITELINE_FUNCTIONAL_AUDIT.md`. Original attachment line numbers; static source extraction, not runtime test results.

Source SHA-256: `9d69b7bd030a86705449af187fb8d5084ca2f6edf9ae38f59ffd238d0a4f7d4d`

## JavaScript functions

All named function declarations, including secondary rendering/helpers and excluded share-link functions. Presence does not establish reachability or authorization.

| Line | Function |
|---|---|
| 3030 | `validateUpload(file, presetKey)` |
| 3046 | `checkUploadOrAlert(file, presetKey, inputEl)` |
| 3093 | `seedActivity(type, title, detail, actor, role, minutesAgo, unread, targetRole, anchorId)` |
| 3110 | `logActivity(type, title, detail, targetRole, anchorId)` |
| 3133 | `goToActivityTarget(id)` |
| 3156 | `timeAgo(ts)` |
| 3169 | `renderCapWarning()` |
| 3184 | `updateNotifBadge()` |
| 3196 | `renderNotifPanel()` |
| 3217 | `toggleNotifPanel(force)` |
| 3227 | `markAllNotifsRead()` |
| 3242 | `setActivityFilter(filter)` |
| 3250 | `renderActivityList()` |
| 3275 | `openActivityLog()` |
| 3281 | `closeActivityLog()` |
| 3290 | `openSettingsPanel()` |
| 3296 | `closeSettingsPanel()` |
| 3301 | `renderSettingsPanel()` |
| 3400 | `toggleNotifMute(type, checked)` |
| 3455 | `onRuleFieldChanged(fieldId)` |
| 3464 | `confirmRuleChange(fieldId)` |
| 3482 | `cancelRuleChange(fieldId)` |
| 3493 | `applyShareLinkDefault()` |
| 3527 | `switchView(role)` |
| 3544 | `isLeadSpmForAlden()` |
| 3556 | `renderAssignmentGate()` |
| 3637 | `navItemKey(item)` |
| 3642 | `applySection(activeView, section)` |
| 3648 | `buildSidebarNav(role)` |
| 3701 | `toggleNavGroup(key)` |
| 3710 | `navTo(target)` |
| 3764 | `fillDemoLogin(role)` |
| 3779 | `notifyAdminAboutAccount()` |
| 3793 | `attemptLogin()` |
| 3840 | `enterApp()` |
| 3855 | `logoutSession()` |
| 3883 | `clearIdleTimers()` |
| 3890 | `resetIdleTimer()` |
| 3900 | `showIdleWarning()` |
| 3914 | `stayLoggedIn()` |
| 3919 | `idleLogoutNow()` |
| 3953 | `requireRole(allowedRoles)` |
| 3967 | `showConflictBanner(containerId, message)` |
| 3975 | `switchArchiveTab(scope, tab)` |
| 3985 | `scrollToModule(id)` |
| 3993 | `showClientActivatedModal(projectName, clientName, isNewAccount)` |
| 4008 | `closeClientActivatedModal()` |
| 4013 | `viewClientPortalAfterActivation()` |
| 4019 | `showProjectCompleteModal(projectName)` |
| 4026 | `closeProjectCompleteModal()` |
| 4039 | `showProjectSentModal(projectName)` |
| 4048 | `closeProjectSentModal()` |
| 4055 | `goToActiveSitesFromModal()` |
| 4092 | `updateProjectIntakeStepper(step)` |
| 4118 | `openProjectIntakeModal()` |
| 4135 | `closeProjectIntakeModal()` |
| 4147 | `escapeClientHtml(value)` |
| 4151 | `populateProjectClientSelect(preferredId)` |
| 4165 | `handleProjectClientSelection(value)` |
| 4177 | `openNewClientModal()` |
| 4197 | `closeNewClientModal()` |
| 4202 | `createClientFromProjectIntake()` |
| 4250 | `validateProjectDetailsBeforeAllocation()` |
| 4273 | `showSuggestedAllocationForSelectedType()` |
| 4291 | `goToSuggestedAllocation()` |
| 4295 | `backToProjectDetails()` |
| 4337 | `abbreviateName(full)` |
| 4345 | `formatSpmCell(spmName)` |
| 4351 | `syncIntakeLogStatus(projectName, pillClass, pillText)` |
| 4361 | `syncIntakeLogOpm(projectName, opmName)` |
| 4370 | `syncIntakeLogSpm(projectName, spmName)` |
| 4387 | `showResubmitControl(projectName)` |
| 4409 | `isOpmInCooldown(acct)` |
| 4413 | `opmCooldownLabel(acct)` |
| 4423 | `startOpmCooldown(opmName, reason)` |
| 4433 | `clearOpmCooldown(id)` |
| 4445 | `pickBestOpm(item, excluded)` |
| 4459 | `currentDraftProjectType()` |
| 4466 | `refreshOpmSuggestion(resetExclusions)` |
| 4496 | `rerunAllocationSuggestion()` |
| 4524 | `swapOpmCandidate()` |
| 4539 | `viewOpmCandidateProfile()` |
| 4556 | `openResubmitModal(projectName)` |
| 4581 | `populateResubmitOpmSelect(item)` |
| 4601 | `resubmitSpmCandidatesForPhase(type, stage, excludedSpms)` |
| 4605 | `setResubmitPhaseAssignment(stage, acctId, item)` |
| 4610 | `renderResubmitPhaseAssignmentTable(item)` |
| 4639 | `summarizeResubmitPhaseAssignments(item)` |
| 4648 | `updateResubmitHeadcount(item)` |
| 4668 | `rerunResubmitSuggestion()` |
| 4681 | `confirmResubmit()` |
| 4720 | `closeResubmitModal()` |
| 4729 | `addSpmResponseRow(projectName, spmName, pillClass, pillText, note)` |
| 4743 | `renderOPMConfirmQueue()` |
| 4834 | `changeSuggestedSpm(id, newName)` |
| 4842 | `showOpmAcceptedNextModal(item)` |
| 4851 | `closeOpmAcceptedNextModal()` |
| 4854 | `continueOpmAcceptedToDocuments()` |
| 4870 | `acceptOPMConfirmation(id)` |
| 4919 | `requestOPMChanges(id)` |
| 4997 | `generateTempPassword()` |
| 5004 | `regenerateTempPassword()` |
| 5009 | `renderAcctScopeField()` |
| 5024 | `wireProjectTypeChips(container)` |
| 5085 | `acctRoleSwitchButtons()` |
| 5087 | `scopeSummary(acct)` |
| 5095 | `setAcctRoleFilter(role, button)` |
| 5101 | `renderAccountsTable()` |
| 5142 | `toggleAccountStatus(id)` |
| 5159 | `openAccountDrawer(id, mode)` |
| 5166 | `closeAccountDrawer()` |
| 5176 | `openSpmTeamDrawer(itemId)` |
| 5206 | `closeSpmTeamDrawer()` |
| 5211 | `renderAccountDrawer(mode)` |
| 5270 | `saveAccountEdit()` |
| 5346 | `toggleCreateAccountForm()` |
| 5358 | `createAccount()` |
| 5419 | `copyCreatedPassword()` |
| 5436 | `populateShareProjectOptions()` |
| 5450 | `generateShareToken()` |
| 5459 | `computeExpiryDate(code, fromDate)` |
| 5468 | `formatShareDate(d)` |
| 5472 | `shareLinkStatus(link)` |
| 5478 | `renderShareTable()` |
| 5515 | `createShareLink()` |
| 5593 | `revokeShareLink(id)` |
| 5602 | `copyShareLink()` |
| 5609 | `advanceAdminStepper()` |
| 5624 | `handleAdminContractFileChosen(input)` |
| 5640 | `uploadAdminContract()` |
| 5649 | `lockAdminContract()` |
| 5658 | `viewAdminContract()` |
| 5666 | `downloadAdminContract()` |
| 5687 | `toggleClientSubconFields(isChecked)` |
| 5692 | `handleClientSubconFileChosen(input)` |
| 5708 | `uploadClientSubcon()` |
| 5717 | `lockClientSubcon()` |
| 5729 | `viewClientSubconAgreement()` |
| 5737 | `confirmAndSendToOPM()` |
| 5940 | `isSubconDoubleBooked(s)` |
| 5944 | `committedUntilLabel(s)` |
| 5975 | `getCurrentProjectType()` |
| 5982 | `getRequiredCertifications(s)` |
| 5991 | `subconCertCoverage(s)` |
| 6004 | `subconEffectiveScore(s)` |
| 6014 | `rankSubcons(list)` |
| 6051 | `findSubconById(id)` |
| 6055 | `clientSubconCardHtml()` |
| 6075 | `workersToggleHtml(subconId, workers)` |
| 6083 | `workerRowHtml(subconId, w, locked)` |
| 6122 | `workersPanelHtml(subconId, workers, locked)` |
| 6146 | `toggleSubconWorkers(subconId)` |
| 6154 | `getWorkerList(subconId)` |
| 6160 | `editWorker(subconId, workerId)` |
| 6165 | `cancelWorkerEdit()` |
| 6170 | `saveWorkerEdit(subconId, workerId)` |
| 6210 | `addWorker(subconId)` |
| 6262 | `availabilityText(w)` |
| 6269 | `certStatus(w)` |
| 6281 | `engineerLicenseStatus(acct)` |
| 6290 | `licenseGraceExpired(acct)` |
| 6298 | `aggregateAllWorkers()` |
| 6317 | `workerDetailHtml(entry)` |
| 6340 | `workerDirectoryCardHtml(entry)` |
| 6363 | `toggleWorkerDetail(key)` |
| 6377 | `seedFromString(str)` |
| 6383 | `mulberry32(seed)` |
| 6410 | `disciplineKeyForGroup(group)` |
| 6415 | `getDisciplineLaborRoles(group)` |
| 6419 | `generateCompanyLaborPool(group)` |
| 6452 | `csvEscapeCell(val)` |
| 6457 | `downloadCompanyLaborCSV(companyId)` |
| 6482 | `toggleDirectoryCompanyWorkers(key, scope)` |
| 6493 | `companyActiveProjectNames(s)` |
| 6504 | `companyIsBusy(s)` |
| 6508 | `companyPrimaryContactWorker(s)` |
| 6514 | `companyLicensureSummary(s)` |
| 6525 | `companyAvailabilitySummary(s)` |
| 6537 | `buildSubconDirectoryGroups()` |
| 6575 | `tradeVisual(trade)` |
| 6586 | `companyInitials(name)` |
| 6592 | `subconCompanyCardHtml(group, workerEntries, scope)` |
| 6663 | `renderSubconDirectory()` |
| 6664 | `renderSPMSubconDirectory()` |
| 6666 | `renderDirectoryForScope(scope)` |
| 6760 | `parseExcelCertifications(raw)` |
| 6765 | `resetNewSubconUpload(scope)` |
| 6771 | `handleNewSubconExcelUpload(scope, event)` |
| 6846 | `toggleEngineerCard(id)` |
| 6854 | `viewLinkedAccount(id, evt)` |
| 6862 | `viewEngineerRecord(id)` |
| 6879 | `engineerProjectHistory(name)` |
| 6925 | `getEmploymentContract(acct)` |
| 6932 | `triggerEmploymentContractUpload(acctId)` |
| 6938 | `handleEmploymentContractFileSelected(e)` |
| 6953 | `viewEmploymentContract(acctId)` |
| 6960 | `downloadEmploymentContract(acctId)` |
| 6974 | `employmentContractHtml(acct)` |
| 6992 | `engineerHistoryHtml(acct)` |
| 7005 | `engineerCardHtml(acct)` |
| 7070 | `renderEngineerDirectory()` |
| 7098 | `renderWorkerDirectory()` |
| 7107 | `refreshAccountDrawerIfOpen(acctId)` |
| 7120 | `openAddLicenseModal(acctId)` |
| 7135 | `closeAddLicenseModal()` |
| 7141 | `handleAddLicenseFileSelected(e)` |
| 7150 | `saveAddLicense()` |
| 7193 | `triggerLicenseUpload(acctId)` |
| 7204 | `handleLicenseFileSelected(e)` |
| 7217 | `confirmLicenseUpload()` |
| 7231 | `cancelLicenseUpload()` |
| 7235 | `closeConfirmLicenseModal()` |
| 7245 | `undoLicenseUpload(acctId)` |
| 7259 | `notifyEngineerAboutLicense(acctId, btnEl)` |
| 7280 | `renderSubconPanel()` |
| 7405 | `renderSubconOutreachList()` |
| 7453 | `contactSubconByEmail(id)` |
| 7468 | `consentTimestamp()` |
| 7477 | `consentStatusHtml(s)` |
| 7501 | `simulateSubconResponse(id, accepted)` |
| 7526 | `teamConsentComplete()` |
| 7533 | `addManualSubconById(id)` |
| 7539 | `swapSubcon(oldId, newValue)` |
| 7553 | `addManualSubcon()` |
| 7562 | `toggleNewSubconForm(scope, show)` |
| 7577 | `submitNewSubconRequest(scope)` |
| 7632 | `withdrawPendingSubcon(id)` |
| 7642 | `renderAdminPendingSubcons()` |
| 7675 | `approvePendingSubcon(id, expectedVersion)` |
| 7694 | `rejectPendingSubcon(id, expectedVersion)` |
| 7712 | `simulateSubconConflict(id)` |
| 7732 | `updateDirectoryTiles()` |
| 7743 | `renderLicenseAlertBanner()` |
| 7885 | `getAldenProject()` |
| 7889 | `aldenOpmHasAccepted()` |
| 7894 | `aldenTeamFullyConfirmed()` |
| 7900 | `refreshAldenAssignmentWorkflow()` |
| 7959 | `isMaterialUpdate(pendingUpdate)` |
| 7964 | `daysUntilAutoApprove(pendingUpdate)` |
| 7975 | `pendingUpdateStatusText(pu)` |
| 7984 | `pendingUpdateBadgeText(pu)` |
| 7993 | `phaseOwnerName(site, stage)` |
| 8005 | `applyPendingUpdate(site, resolutionNote)` |
| 8021 | `clientVisibleHistory(site)` |
| 8030 | `buildClientProgressReportText(site)` |
| 8066 | `clientHistoryEntriesHtml(site)` |
| 8078 | `toggleClientHistoryList(id)` |
| 8093 | `clientChecklistRowHtml(item)` |
| 8100 | `clientChecklistHtml(site)` |
| 8106 | `toggleClientChecklist(id)` |
| 8123 | `clientDocRepoRowHtml(item, projectName)` |
| 8139 | `clientVisibleDocItems(site)` |
| 8143 | `clientDocRepoHtml(site)` |
| 8149 | `toggleClientDocRepo(id)` |
| 8163 | `downloadClientProgressReport(id)` |
| 8178 | `approveUpdateNow(id, expectedVersion)` |
| 8195 | `simulateUpdateAutoApprove(id)` |
| 8212 | `checkPendingUpdateAutoApprovals()` |
| 8234 | `renderUpdateQueue()` |
| 8317 | `isDocClientVisible(docId)` |
| 8322 | `escJs(s)` |
| 8330 | `downloadDocPlaceholder(docLabel, projectName, sub)` |
| 8354 | `getProjectDocumentItems(id)` |
| 8379 | `getActiveSiteIdByName(name)` |
| 8387 | `downloadAllDocsForProject(id, projectName)` |
| 8394 | `repoRowHtml(name, sub, done, sourceRole, projectName, docId)` |
| 8462 | `toggleDocRepoFolder(id)` |
| 8468 | `docRepoProgressHtml(project)` |
| 8485 | `getEngagementAgreement(site, engineerName)` |
| 8493 | `engineersNeedingEngagement(site)` |
| 8499 | `triggerEngagementUpload(siteId, engineerName)` |
| 8505 | `handleEngagementFileSelected(e)` |
| 8518 | `viewEngagementDoc(siteId, engineerName)` |
| 8525 | `downloadEngagementDoc(siteId, engineerName)` |
| 8537 | `engagementRowHtml(site, eng)` |
| 8555 | `engagementSectionHtml(site)` |
| 8561 | `docRepoFolderHtml(project, opmDocsHtml, uploadedCount, totalCount)` |
| 8609 | `toggleEngineerDocRepoFolder(id)` |
| 8621 | `engineerLicenseDocRowHtml(acct)` |
| 8639 | `engineerDocRepoFolderHtml(acct, uploadedCount, totalCount)` |
| 8672 | `renderAdminDocRepo()` |
| 8764 | `getProjectsForOpm(name)` |
| 8770 | `toggleOpmDocRepoFolder(id)` |
| 8776 | `opmDocRepoFolderHtml(project, docsHtml, uploadedCount, totalCount)` |
| 8801 | `renderOpmDocRepo()` |
| 8833 | `openDocPreview(docLabel, projectName, sub, downloadable)` |
| 8857 | `closeDocPreview()` |
| 8863 | `downloadDocPreviewFile()` |
| 8871 | `isSpmOnSite(site, name)` |
| 8884 | `renderSpmDocRepo()` |
| 8946 | `addBusinessDays(startDate, days)` |
| 8957 | `formatDeadlineDate(d)` |
| 8962 | `businessDaysRemaining(from, to)` |
| 8976 | `startAssignmentDeadline()` |
| 8989 | `stopAssignmentDeadline()` |
| 8995 | `renderDeadlineBadge()` |
| 9020 | `simulateDeadlinePassed()` |
| 9025 | `expireAssignmentDeadline()` |
| 9050 | `showEscalationBanner(projectName, spmName)` |
| 9062 | `showUpdateEscalationBanner(site, pu)` |
| 9075 | `showChecklistEscalationBanner(site, item)` |
| 9083 | `dismissEscalationBanner()` |
| 9087 | `simulateAssignmentConflict()` |
| 9095 | `acceptAssignment()` |
| 9180 | `pendingTeamPhaseRows(aldenSite)` |
| 9192 | `docUnlockReady()` |
| 9196 | `spmIntakeReady()` |
| 9200 | `tryUnlockAldenDocuments()` |
| 9217 | `showDeclineNote()` |
| 9223 | `cancelDeclineAssignment()` |
| 9229 | `confirmDeclineAssignment()` |
| 9267 | `resetAssignmentAfterDecline(customMessage)` |
| 9355 | `handleDocFileChosen(docNum, input)` |
| 9371 | `markDocUploaded(btn)` |
| 9388 | `updateDocProgress()` |
| 9558 | `handleSubconAgreementFileChosen(input)` |
| 9573 | `uploadSubconAgreement()` |
| 9623 | `phaseDisciplinesFor(site)` |
| 9628 | `discChipRowHtml(list, cls)` |
| 9633 | `phaseDisciplinesHtml(site)` |
| 9647 | `tagsRequiredForPhase(type, stage)` |
| 9656 | `activeLeadSpmNames(excludeSiteId)` |
| 9670 | `spmCandidatesForPhase(type, stage, excludeSiteId)` |
| 9689 | `sizeTierFor(sqmText, floorsText)` |
| 9697 | `baseEngineerSlotsForType(type)` |
| 9702 | `updateSuggestedHeadcount()` |
| 9724 | `currentIntakeType()` |
| 9729 | `setPhaseAssignment(stage, acctId)` |
| 9734 | `renderPhaseAssignmentTable()` |
| 9772 | `summarizePhaseAssignments()` |
| 9796 | `syncSeededPhaseTeamSnapshots()` |
| 9814 | `toggleIssuePanel(siteId, buttonEl)` |
| 9822 | `toggleIssueChip(siteId, type, chipEl)` |
| 9841 | `issueChipListHtml(siteId)` |
| 9927 | `getStageChecklist(site, stage)` |
| 9938 | `isStageChecklistComplete(site, stage)` |
| 9943 | `checklistProgressCounts(site, stage)` |
| 9953 | `recalculateChecklistProgressPct(site)` |
| 9973 | `submitChecklistDoc(siteId, stage, docId)` |
| 9996 | `autoAdvanceIfChecklistComplete(site, stage)` |
| 10045 | `approveChecklistDoc(siteId, stage, docId)` |
| 10075 | `rejectChecklistDoc(siteId, stage, docId)` |
| 10096 | `checkChecklistEscalations()` |
| 10113 | `checklistHtml(site)` |
| 10161 | `ensureDocumentUploadConfirmModal()` |
| 10185 | `escapeDocumentFileName(value)` |
| 10191 | `buildUploadPreviewMarkup(file, prefix)` |
| 10223 | `openDocumentUploadConfirm(kind, file, meta)` |
| 10235 | `closeDocumentUploadConfirm(clearInput)` |
| 10248 | `backFromDocumentUploadConfirm()` |
| 10250 | `retryDocumentUpload()` |
| 10259 | `confirmDocumentUpload()` |
| 10376 | `ensureChecklistUploadConfirmModal()` |
| 10380 | `escapeChecklistFileName(value)` |
| 10389 | `openChecklistUploadConfirm(siteId, stage, docId, input, file)` |
| 10408 | `closeChecklistUploadConfirm(clearInput)` |
| 10423 | `backFromChecklistUploadConfirm()` |
| 10428 | `retryChecklistUpload()` |
| 10437 | `confirmChecklistUpload()` |
| 10470 | `handleChecklistFileSelected(siteId, stage, docId, input)` |
| 10489 | `renderChecklistQueue()` |
| 10538 | `myPhaseRows()` |
| 10556 | `renderMyPhaseAssignments()` |
| 10671 | `phaseTeamEmbeddedHtml(mine)` |
| 10760 | `leadAssignmentIsConfirmed(site)` |
| 10767 | `acceptMyPhase(siteId, stage)` |
| 10799 | `declineMyPhase(siteId, stage)` |
| 10816 | `simulateAdvancePhase(siteId)` |
| 10839 | `systemPctForStage(stage)` |
| 10842 | `stageIndex(stage)` |
| 10843 | `previousStage(stage)` |
| 10845 | `stageOptions(selectedStage)` |
| 10849 | `activateCurrentPhaseOwner(site)` |
| 10864 | `checkAutoAdvanceStages()` |
| 10876 | `focusProgressPanel(siteId)` |
| 10886 | `renderActiveSites()` |
| 11033 | `updateSysPct(id)` |
| 11039 | `renderHistoryEntries(site)` |
| 11047 | `toggleProgressPanel(id)` |
| 11062 | `toggleCompletedPhasePanel(id, stage)` |
| 11077 | `toggleDiscRef(id)` |
| 11089 | `handleSiteEvidenceSelected(siteId, input)` |
| 11103 | `submitProgress(id)` |
| 11185 | `findSite(id)` |
| 11187 | `pdStatusLabel(site)` |
| 11194 | `pdGalleryHtml(site)` |
| 11210 | `pdChangePhoto(id, delta)` |
| 11217 | `pdGoToPhoto(id, i)` |
| 11222 | `pdAddPhoto(id)` |
| 11231 | `pdPhaseStepperHtml(site)` |
| 11242 | `pdPersonnelHtml(site)` |
| 11255 | `phaseTeamStatusHtml(site, ctx)` |
| 11282 | `reassignPhaseSpm(siteId, stage, acctId)` |
| 11297 | `pdReworkHtml(site)` |
| 11306 | `pdNotesHtml(site)` |
| 11313 | `pdAddNote(id)` |
| 11324 | `pdJumpToUploadPanel(id)` |
| 11334 | `buildProjectDetailHtml(site, ctx)` |
| 11413 | `openProjectDetail(id)` |
| 11432 | `closeProjectDetail()` |
| 11441 | `renderUpcomingDeadlines()` |
| 11495 | `requestSiteUpdate(id, btnEl)` |
| 11509 | `renderActiveSitesMonitor(bodyId, canRequestUpdate)` |
| 11527 | `renderReworkQueue()` |
| 11567 | `approveRework(id, expectedVersion)` |
| 11594 | `declineRework(id, expectedVersion)` |
| 11618 | `simulateReworkConflict(id)` |
| 11651 | `activateClientAccessAfterFullWorkflow(projectName)` |
| 11705 | `addAldenToActiveSites()` |
| 11742 | `seededRandom(seed)` |
| 11752 | `plannedCurve(t)` |
| 11756 | `generateScheduleSeries(seed, totalDays, currentDay, driftBias)` |
| 11780 | `fmtPct(n)` |
| 11782 | `buildDailyBarSVG(plannedToday, actualToday)` |
| 11809 | `buildCumulativeLineSVG(series)` |
| 11849 | `renderSchedulePerformance(prefix, opts)` |

## Original HTML controls and surfaces

Includes controls in static HTML and trailing modal markup; JavaScript-generated controls are covered by the module audit and render-function index. Default field values and sample personnel data are intentionally not duplicated.

| Line | Element | Identity / behavior |
|---|---|---|
| 1092 | button | id=loginNotifyAdminBtn; type=button; onclick=notifyAdminAboutAccount() |
| 1094 | input | id=loginEmail; type=text |
| 1095 | input | id=loginPassword; type=password |
| 1096 | button | type=button; onclick=attemptLogin() |
| 1099 | button | type=button; onclick=fillDemoLogin('admin') |
| 1100 | button | type=button; onclick=fillDemoLogin('opm') |
| 1101 | button | type=button; onclick=fillDemoLogin('spm') |
| 1102 | button | type=button; onclick=fillDemoLogin('spm2') |
| 1103 | button | type=button; onclick=fillDemoLogin('client') |
| 1137 | button | static table; see role inventory |
| 1138 | button | static table; see role inventory |
| 1139 | button | static table; see role inventory |
| 1140 | button | static table; see role inventory |
| 1144 | button | id=notifBellBtn; type=button; onclick=toggleNotifPanel() |
| 1151 | button | type=button; onclick=markAllNotifsRead() |
| 1155 | button | type=button; onclick=toggleNotifPanel(false); openActivityLog(); |
| 1159 | button | id=activityLogBtn; type=button; onclick=openActivityLog() |
| 1163 | button | id=settingsBtn; type=button; onclick=openSettingsPanel() |
| 1171 | button | type=button; onclick=logoutSession() |
| 1197 | table | static table; see role inventory |
| 1229 | div | id=adminEscalationBanner; data-section=dashboard |
| 1234 | button | onclick=dismissEscalationBanner() |
| 1237 | div | id=adminLicenseAlertBanner; data-section=dashboard |
| 1242 | button | onclick=navTo('engineers') |
| 1251 | button | type=button; onclick=openProjectIntakeModal() |
| 1255 | div | id=projectIntakeModal |
| 1259 | div | id=projectIntakeModalTitle |
| 1260 | div | id=projectIntakeModalSub |
| 1262 | button | type=button; onclick=closeProjectIntakeModal(); aria-label=Close |
| 1289 | input | id=fieldProjectName; type=text |
| 1307 | input | id=fieldSqm; type=text; oninput=if(typeof updateSuggestedHeadcount==='function') updateSuggestedHeadcount(); |
| 1311 | input | id=fieldFloors; type=text; oninput=if(typeof updateSuggestedHeadcount==='function') updateSuggestedHeadcount(); |
| 1318 | input | id=fieldStart; type=text |
| 1322 | select | id=fieldClientSelect; onchange=handleProjectClientSelection(this.value) |
| 1325 | input | id=fieldClient; type=hidden |
| 1328 | button | type=button; onclick=openNewClientModal() |
| 1344 | input | id=adminContractFileInput; type=file; accept=.pdf,.jpg,.jpeg,.png; onchange=handleAdminContractFileChosen(this) |
| 1345 | button | id=adminContractChooseBtn; onclick=document.getElementById('adminContractFileInput').click() |
| 1354 | input | id=clientSubconToggle; type=checkbox; onchange=toggleClientSubconFields(this.checked) |
| 1362 | input | id=clientSubconName; type=text |
| 1366 | input | id=clientSubconTrade; type=text |
| 1379 | input | id=clientSubconFileInput; type=file; accept=.pdf,.jpg,.jpeg,.png; onchange=handleClientSubconFileChosen(this) |
| 1380 | button | id=clientSubconChooseBtn; onclick=document.getElementById('clientSubconFileInput').click() |
| 1413 | button | onclick=swapOpmCandidate() |
| 1414 | button | onclick=viewOpmCandidateProfile() |
| 1434 | button | type=button; onclick=rerunAllocationSuggestion() |
| 1435 | button | id=confirmSendBtn; onclick=confirmAndSendToOPM() |
| 1442 | div | id=projectIntakeModalFooter |
| 1452 | table | static table; see role inventory |
| 1514 | input | id=engagementFileInput; type=file; accept=.pdf,.jpg,.jpeg,.png; onchange=handleEngagementFileSelected(event) |
| 1526 | input | id=engDocRepoSearch; type=text; oninput=renderAdminDocRepo() |
| 1540 | input | id=edSearch; type=text; oninput=renderEngineerDirectory() |
| 1541 | select | id=edRoleFilter; onchange=renderEngineerDirectory() |
| 1547 | select | id=edAvailFilter; onchange=renderEngineerDirectory() |
| 1553 | select | id=edCertFilter; onchange=renderEngineerDirectory() |
| 1562 | input | id=engLicenseFileInput; type=file; accept=.pdf,.jpg,.jpeg,.png; onchange=handleLicenseFileSelected(event) |
| 1563 | input | id=engContractFileInput; type=file; accept=.pdf,.jpg,.jpeg,.png; onchange=handleEmploymentContractFileSelected(event) |
| 1575 | input | id=sdSearch; type=text; oninput=renderSubconDirectory() |
| 1576 | select | id=sdBusyFilter; onchange=renderSubconDirectory() |
| 1581 | select | id=sdCertFilter; onchange=renderSubconDirectory() |
| 1588 | select | id=sdAvailFilter; onchange=renderSubconDirectory() |
| 1593 | select | id=sdDisciplineFilter; onchange=renderSubconDirectory() |
| 1609 | div | id=acctCreatedBanner |
| 1614 | button | type=button; onclick=copyCreatedPassword() |
| 1621 | button | type=button |
| 1622 | button | type=button |
| 1623 | button | type=button |
| 1624 | button | type=button |
| 1631 | input | id=acctName; type=text |
| 1635 | input | id=acctEmail; type=email |
| 1642 | input | id=acctPhone; type=text |
| 1655 | button | type=button; onclick=regenerateTempPassword() |
| 1659 | button | onclick=createAccount() |
| 1670 | button | id=toggleCreateAccountBtn; type=button; onclick=toggleCreateAccountForm() |
| 1680 | input | id=acctSearchInput; type=search; oninput=renderAccountsTable() |
| 1684 | button | type=button; onclick=setAcctRoleFilter('all',this) |
| 1685 | button | type=button; onclick=setAcctRoleFilter('admin',this) |
| 1686 | button | type=button; onclick=setAcctRoleFilter('opm',this) |
| 1687 | button | type=button; onclick=setAcctRoleFilter('spm',this) |
| 1688 | button | type=button; onclick=setAcctRoleFilter('client',this) |
| 1692 | table | static table; see role inventory |
| 1705 | table | static table; see role inventory |
| 1722 | div | id=shareCreatedBanner |
| 1727 | button | type=button; onclick=copyShareLink() |
| 1733 | select | id=shareProject |
| 1741 | select | id=shareScope |
| 1749 | select | id=shareExpiry |
| 1761 | button | onclick=createShareLink() |
| 1773 | button | type=button; data-scope=admin; data-tab=closed; onclick=switchArchiveTab('admin','closed') |
| 1774 | button | type=button; data-scope=admin; data-tab=declined; onclick=switchArchiveTab('admin','declined') |
| 1775 | button | type=button; data-scope=admin; data-tab=expired; onclick=switchArchiveTab('admin','expired') |
| 1776 | button | type=button; data-scope=admin; data-tab=accounts; onclick=switchArchiveTab('admin','accounts') |
| 1777 | button | type=button; data-scope=admin; data-tab=links; onclick=switchArchiveTab('admin','links') |
| 1787 | table | static table; see role inventory |
| 1797 | button | type=button |
| 1806 | button | type=button |
| 1820 | table | static table; see role inventory |
| 1851 | table | static table; see role inventory |
| 1872 | select | static table; see role inventory |
| 1883 | table | static table; see role inventory |
| 1892 | button | type=button |
| 1894 | button | type=button |
| 1903 | table | static table; see role inventory |
| 1925 | table | static table; see role inventory |
| 1975 | table | static table; see role inventory |
| 2026 | button | onclick=viewAdminContract() |
| 2027 | button | onclick=downloadAdminContract() |
| 2056 | input | id=docFileInput-1; type=file; accept=.pdf,.jpg,.jpeg,.png; onchange=handleDocFileChosen(1, this) |
| 2057 | button | id=docChooseBtn-1; onclick=document.getElementById('docFileInput-1').click(); disabled=true |
| 2070 | input | id=docFileInput-2; type=file; accept=.pdf,.jpg,.jpeg,.png; onchange=handleDocFileChosen(2, this) |
| 2071 | button | id=docChooseBtn-2; onclick=document.getElementById('docFileInput-2').click(); disabled=true |
| 2084 | input | id=docFileInput-3; type=file; accept=.pdf,.jpg,.jpeg,.png; onchange=handleDocFileChosen(3, this) |
| 2085 | button | id=docChooseBtn-3; onclick=document.getElementById('docFileInput-3').click(); disabled=true |
| 2098 | input | id=docFileInput-4; type=file; accept=.pdf,.jpg,.jpeg,.png; onchange=handleDocFileChosen(4, this) |
| 2099 | button | id=docChooseBtn-4; onclick=document.getElementById('docFileInput-4').click(); disabled=true |
| 2112 | input | id=docFileInput-5; type=file; accept=.pdf,.jpg,.jpeg,.png; onchange=handleDocFileChosen(5, this) |
| 2113 | button | id=docChooseBtn-5; onclick=document.getElementById('docFileInput-5').click(); disabled=true |
| 2126 | input | id=docFileInput-6; type=file; accept=.pdf,.jpg,.jpeg,.png; onchange=handleDocFileChosen(6, this) |
| 2127 | button | id=docChooseBtn-6; onclick=document.getElementById('docFileInput-6').click(); disabled=true |
| 2144 | div | id=projectStartBanner |
| 2199 | table | static table; see role inventory |
| 2217 | button | type=button; data-scope=opm; data-tab=docs; onclick=switchArchiveTab('opm','docs') |
| 2218 | button | type=button; data-scope=opm; data-tab=changes; onclick=switchArchiveTab('opm','changes') |
| 2219 | button | type=button; data-scope=opm; data-tab=responses; onclick=switchArchiveTab('opm','responses') |
| 2229 | table | static table; see role inventory |
| 2237 | button | type=button |
| 2244 | button | type=button |
| 2258 | table | static table; see role inventory |
| 2285 | table | static table; see role inventory |
| 2366 | div | id=spmLockBanner |
| 2377 | div | id=assignmentConflictBanner |
| 2420 | select | id=subconManualSelect |
| 2423 | button | onclick=addManualSubcon() |
| 2424 | button | id=newSubconToggleBtn; onclick=toggleNewSubconForm('assignment') |
| 2432 | input | id=newSubconName; type=text |
| 2436 | input | id=newSubconTrade; type=text |
| 2442 | input | id=newSubconContact; type=text |
| 2446 | input | id=newSubconPhone; type=text |
| 2450 | button | type=button; onclick=document.getElementById('newSubconWorkerExcelInput').click() |
| 2452 | input | id=newSubconWorkerExcelInput; type=file; accept=.xlsx,.xls; onchange=handleNewSubconExcelUpload('assignment', event) |
| 2456 | button | onclick=submitNewSubconRequest('assignment') |
| 2457 | button | onclick=toggleNewSubconForm('assignment', false) |
| 2480 | input | id=subconAgreementFileInput; type=file; accept=.pdf,.jpg,.jpeg,.png; onchange=handleSubconAgreementFileChosen(this) |
| 2481 | button | id=subconAgreementChooseBtn; onclick=document.getElementById('subconAgreementFileInput').click(); disabled=true |
| 2494 | table | static table; see role inventory |
| 2521 | input | id=spmSdSearch; type=text; oninput=renderSPMSubconDirectory() |
| 2522 | select | id=spmSdBusyFilter; onchange=renderSPMSubconDirectory() |
| 2527 | select | id=spmSdCertFilter; onchange=renderSPMSubconDirectory() |
| 2534 | select | id=spmSdAvailFilter; onchange=renderSPMSubconDirectory() |
| 2539 | select | id=spmSdDisciplineFilter; onchange=renderSPMSubconDirectory() |
| 2544 | button | id=sdNewSubconToggleBtn; type=button; onclick=toggleNewSubconForm('directory') |
| 2551 | input | id=sdNewSubconName; type=text |
| 2555 | input | id=sdNewSubconTrade; type=text |
| 2561 | input | id=sdNewSubconContact; type=text |
| 2565 | input | id=sdNewSubconPhone; type=text |
| 2569 | button | type=button; onclick=document.getElementById('sdNewSubconWorkerExcelInput').click() |
| 2571 | input | id=sdNewSubconWorkerExcelInput; type=file; accept=.xlsx,.xls; onchange=handleNewSubconExcelUpload('directory', event) |
| 2575 | button | onclick=submitNewSubconRequest('directory') |
| 2576 | button | onclick=toggleNewSubconForm('directory', false) |
| 2591 | button | type=button; data-scope=spm; data-tab=completed; onclick=switchArchiveTab('spm','completed') |
| 2592 | button | type=button; data-scope=spm; data-tab=subconhistory; onclick=switchArchiveTab('spm','subconhistory') |
| 2593 | button | type=button; data-scope=spm; data-tab=declined; onclick=switchArchiveTab('spm','declined') |
| 2603 | table | static table; see role inventory |
| 2612 | button | type=button |
| 2620 | button | type=button |
| 2634 | table | static table; see role inventory |
| 2665 | table | static table; see role inventory |
| 2701 | button | onclick=openProjectDetail(4) |
| 2737 | div | id=activityOverlay; onclick=closeActivityLog() |
| 2740 | div | id=pdOverlay; onclick=closeProjectDetail() |
| 2741 | div | id=pdModal |
| 2742 | div | id=activityDrawer |
| 2746 | button | type=button; onclick=closeActivityLog() |
| 2750 | button | type=button; onclick=setActivityFilter('all') |
| 2751 | button | type=button; onclick=setActivityFilter('request') |
| 2752 | button | type=button; onclick=setActivityFilter('approval') |
| 2753 | button | type=button; onclick=setActivityFilter('progress') |
| 2754 | button | type=button; onclick=setActivityFilter('account') |
| 2755 | button | type=button; onclick=setActivityFilter('session') |
| 2761 | div | id=settingsOverlay; onclick=closeSettingsPanel() |
| 2762 | div | id=settingsDrawer |
| 2766 | button | type=button; onclick=closeSettingsPanel() |
| 2773 | div | id=accountOverlay; onclick=closeAccountDrawer() |
| 2774 | div | id=accountDrawer |
| 2777 | h2 | id=accountDrawerTitle |
| 2778 | button | type=button; onclick=closeAccountDrawer() |
| 2780 | div | id=accountDrawerSub |
| 2782 | div | id=accountDrawerBody |
| 2785 | div | id=spmTeamOverlay; onclick=closeSpmTeamDrawer() |
| 2786 | div | id=spmTeamDrawer |
| 2789 | h2 | id=spmTeamDrawerTitle |
| 2790 | button | type=button; onclick=closeSpmTeamDrawer() |
| 2792 | div | id=spmTeamDrawerSub |
| 2794 | div | id=spmTeamDrawerBody |
| 2797 | div | id=newClientModal |
| 2801 | div | id=ncmTitle |
| 2804 | input | id=newClientName; type=text |
| 2805 | input | id=newClientContact; type=text |
| 2808 | input | id=newClientEmail; type=email |
| 2809 | input | id=newClientPhone; type=text |
| 2812 | div | id=newClientCreatedBanner |
| 2819 | button | type=button; onclick=closeNewClientModal() |
| 2820 | button | type=button; onclick=createClientFromProjectIntake() |
| 2825 | div | id=addLicenseModal |
| 2829 | div | id=alTitle |
| 2830 | p | id=alSub |
| 2833 | input | id=alLicenseNumber; type=text |
| 2837 | input | id=alLicenseExpiry; type=date |
| 2841 | input | id=alCertifications; type=text |
| 2845 | button | id=alChooseFileBtn; type=button; onclick=document.getElementById('alFileInput').click() |
| 2846 | input | id=alFileInput; type=file; accept=.pdf,.jpg,.jpeg,.png; onchange=handleAddLicenseFileSelected(event) |
| 2852 | button | type=button; onclick=closeAddLicenseModal() |
| 2853 | button | type=button; onclick=saveAddLicense() |
| 2858 | div | id=confirmLicenseModal |
| 2862 | div | id=clmTitle |
| 2863 | p | id=clmSub |
| 2864 | div | id=clmFileName |
| 2867 | button | type=button; onclick=cancelLicenseUpload() |
| 2868 | button | type=button; onclick=confirmLicenseUpload() |
| 2873 | div | id=resubmitProjectModal |
| 2877 | div | id=rsmTitle |
| 2893 | select | id=resubmitOpmSelect |
| 2897 | button | type=button; onclick=rerunResubmitSuggestion() |
| 2915 | button | type=button; onclick=closeResubmitModal() |
| 2916 | button | type=button; onclick=confirmResubmit() |
| 2921 | div | id=docPreviewModal |
| 2925 | div | id=docPreviewTitle |
| 2926 | p | id=docPreviewSub |
| 2937 | button | type=button; onclick=closeDocPreview() |
| 2938 | button | id=docPreviewDownloadBtn; type=button; onclick=downloadDocPreviewFile() |
| 2943 | div | id=projectCompleteModal |
| 2947 | div | id=pcmTitle |
| 2949 | div | id=pcmProjectName |
| 2952 | button | type=button; onclick=closeProjectCompleteModal() |
| 2953 | button | type=button; onclick=goToActiveSitesFromModal() |
| 2958 | div | id=clientActivatedModal |
| 2962 | div | id=clientActivatedTitle |
| 2963 | p | id=clientActivatedMessage |
| 2964 | div | id=clientActivatedProject |
| 2971 | button | type=button; onclick=closeClientActivatedModal() |
| 2976 | div | id=projectSentModal |
| 2980 | div | id=projectSentTitle |
| 2982 | div | id=projectSentName |
| 2989 | button | type=button; onclick=closeProjectSentModal() |
| 2994 | div | id=idleWarningModal |
| 2998 | div | id=idleWarningTitle |
| 3002 | button | type=button; onclick=idleLogoutNow() |
| 3003 | button | type=button; onclick=stayLoggedIn() |
| 11896 | button | type=button; onclick=backFromDocumentUploadConfirm() |
| 11897 | button | type=button; onclick=retryDocumentUpload() |
| 11898 | button | type=button; onclick=confirmDocumentUpload() |
| 11913 | button | type=button; onclick=backFromChecklistUploadConfirm() |
| 11914 | button | type=button; onclick=retryChecklistUpload() |
| 11915 | button | type=button; onclick=confirmChecklistUpload() |
| 11922 | div | id=opmAcceptedNextModal |
| 11926 | div | id=opmAcceptedNextTitle |
| 11931 | div | id=opmAcceptedModalProgress |
| 11932 | div | id=opmAcceptedModalCount |
| 11936 | button | type=button; onclick=closeOpmAcceptedNextModal() |
| 11937 | button | type=button; onclick=continueOpmAcceptedToDocuments() |

## Activity log call sites

Every source line calling `logActivity`, plus multiline continuation through its statement ending. Includes excluded share-link events for traceability; they are not rebuild requirements.

### Source line 3837

```javascript
logActivity('login', acct.name + ' logged in', titles[acct.role].sidebar + ' · ' + acct.email);
```

### Source line 3856

```javascript
if (currentSession) logActivity('logout', currentSession.name + ' logged out', titles[currentSession.role].sidebar + ' · ' + currentSession.email);
```

### Source line 4427

```javascript
logActivity('account', acct.name + ' placed on ' + OPM_COOLDOWN_HOURS + 'h cooldown', reason + ' · ineligible for any new project suggestion until cooldown ends', 'admin', 'adminAccountsCard');
```

### Source line 4440

```javascript
logActivity('account', acct.name + ' cooldown cleared manually', 'Demo override — eligible for suggestions again', 'admin', 'adminAccountsCard');
```

### Source line 4717

```javascript
logActivity('request', 'Project reassigned to you for confirmation', item.name + ' · ' + item.type + ' · ' + item.sqm + ' sqm · Suggested SPM ' + item.suggestedSpm, 'opm', 'confirmqueue');
```

### Source line 4882

```javascript
logActivity('approval', 'OPM confirmed project', item.name + ' · Suggested SPM ' + item.suggestedSpm + (wasReassignment ? ' (reassigned)' : ''), 'admin', 'adminIntakeLogCard');
```

### Source line 4937

```javascript
logActivity('request', 'OPM requested changes on project intake', item.name + ' · needs revision and resubmission', 'admin', 'adminIntakeLogCard');
```

### Source line 5148

```javascript
logActivity('account', acct.name + ' account ' + (acct.status === 'suspended' ? 'suspended' : 'reactivated'), ROLE_LABELS[acct.role] + ' · ' + acct.email, 'admin', 'adminAccountsCard');
```

### Source line 5342

```javascript
logActivity('account', acct.name + ' account details updated', ROLE_LABELS[acct.role] + ' · ' + acct.email, 'admin', 'adminAccountsCard');
```

### Source line 5410

```javascript
logActivity('account', 'New account created — ' + name, ROLE_LABELS[acctSelectedRole] + ' · ' + email, 'admin', 'adminAccountsCard');
```

### Source line 5588

```javascript
logActivity('system', 'External share link created', project + ' · ' + SHARE_SCOPE_LABEL[scope] +
(scope === 'documents' && excludedDocs.length ? ' (' + excludedDocs.length + ' internal doc' + (excludedDocs.length === 1 ? '' : 's') + ' auto-excluded)' : ''),
'admin', 'adminShareLinksCard');
```

### Source line 5599

```javascript
logActivity('system', 'External share link revoked', link.project, 'admin', 'adminShareLinksCard');
```

### Source line 5839

```javascript
logActivity('request', 'New project awaiting your confirmation', name + ' · ' + type + ' · ' + sqm + ' sqm · Suggested SPM ' + spmName, 'opm', 'confirmqueue');
```

### Source line 7190

```javascript
logActivity('account', acct.name + ' license added', ROLE_LABELS[acct.role] + ' · ' + licenseNumber, 'admin', 'adminEngineerDirectoryCard');
```

### Source line 7264

```javascript
logActivity(
'notice',
'License renewal reminder sent to ' + acct.name,
'PRC license ' + statusPhrase + ' \u2014 asked to upload a renewed license before sign-in is blocked.',
acct.role,
'engineers'
);
```

### Source line 7462

```javascript
logActivity('request', 'Site PM recorded subcontractor contact attempt', ASSIGNMENT_PROJECT_NAME + ' · ' + sub.name, 'spm', 'assignment');
```

### Source line 7510

```javascript
logActivity('approval', s.name + ' confirmed the assignment', ASSIGNMENT_PROJECT_NAME + ' · ' + s.trade + ' · acceptance manually recorded by Site PM', 'spm', 'assignment');
```

### Source line 7518

```javascript
logActivity('request', s.name + ' declined the assignment', ASSIGNMENT_PROJECT_NAME + ' · ' + s.trade + ' · removed from team automatically — reach out to another match below', 'spm', 'assignment');
```

### Source line 7629

```javascript
logActivity('request', 'New subcontractor request submitted', name + ' · ' + trade + (uploadedWorkers.length ? ' · ' + uploadedWorkers.length + ' worker(s) queued for headcount' : '') + ' · Alden Heights Residences — Tower B', 'spm', 'assignment');
```

### Source line 7691

```javascript
logActivity('approval', 'Subcontractor request approved', req.name + ' · ' + req.trade + ' added to directory', 'admin', 'adminPendingSubconCard');
```

### Source line 7709

```javascript
logActivity('request', 'Subcontractor request rejected', reqName, 'admin', 'adminPendingSubconCard');
```

### Source line 7909

```javascript
logActivity('approval', 'All assigned Site PMs confirmed', item.name + ' · Lead SPM can now allocate subcontractors', 'opm', 'assignment');
```

### Source line 8189

```javascript
logActivity('approval', 'Progress update approved', site.name + ' · ' + stage + ' · ' + pct + '%', 'opm', 'reworkqueue');
```

### Source line 8222

```javascript
logActivity('approval', 'Progress update auto-approved by system', site.name + ' · ' + stage + ' · ' + pct + '% · no stage/% change · Office PM did not respond within ' + UPDATE_AUTO_APPROVE_DAYS + ' days', 'opm', 'reworkqueue');
```

### Source line 8226

```javascript
logActivity('approval', 'Progress update escalated to Admin', site.name + ' · ' + pu.priorStage + ' ' + pu.priorPct + '% → ' + pu.requestedStage + ' ' + pu.systemPct + '% · Office PM did not respond within ' + UPDATE_AUTO_APPROVE_DAYS + ' days — stage/% change requires manual approval', 'opm', 'reworkqueue');
```

### Source line 8853

```javascript
logActivity('view', (downloadable ? 'Viewed document (watermarked)' : 'Viewed own submitted document (watermarked, view-only)'),
projectName + ' · ' + docLabel, currentSession.role, downloadable ? 'docrepo-projects' : 'spmdocrepo');
```

### Source line 9168

```javascript
logActivity('approval', 'Lead Site PM accepted assignment', 'Alden Heights Residences — Tower B · Karlo M. Espiritu · waiting for remaining SPM responses', 'spm', 'assignment');
```

### Source line 9264

```javascript
logActivity('request', 'Site PM declined assignment', projectName + ' · "' + note + '"', 'spm', 'assignment');
```

### Source line 9985

```javascript
logActivity('progress', 'Activity document submitted for QA/QC review', site.name + ' · ' + stage + ' · ' + item.label, 'spm', 'activesites');
```

### Source line 10019

```javascript
logActivity('approval', 'Project advanced to next phase', site.name + ' · ' + fromStage + ' → ' + nextStage + ' (activity checklist cleared)', 'opm', 'reworkqueue');
```

### Source line 10034

```javascript
logActivity('notice', 'Next phase is now active', site.name + ' · ' + fromStage + ' → ' + nextStage + ' · assigned to ' + nextRow.spmName, 'spm', 'assignment');
```

### Source line 10069

```javascript
logActivity('approval', 'Activity document approved', site.name + ' · ' + stage + ' · ' + item.label, 'opm', 'reworkqueue');
```

### Source line 10085

```javascript
logActivity('request', 'Activity document rejected', site.name + ' · ' + stage + ' · ' + item.label, 'opm', 'reworkqueue');
```

### Source line 10102

```javascript
logActivity('approval', 'Activity document review escalated to Admin', site.name + ' · ' + site.stage + ' · ' + item.label + ' · Office PM did not review within ' + CHECKLIST_ESCALATE_DAYS + ' days', 'opm', 'reworkqueue');
```

### Source line 10307

```javascript
logActivity('approval', 'All six Office PM documents uploaded', ASSIGNMENT_PROJECT_NAME + ' · Site PM assignment acceptance is now available', 'spm', 'assignment');
```

### Source line 10343

```javascript
logActivity('account', 'Employment contract uploaded', acct.name + ' (' + (ROLE_LABELS[acct.role] || acct.role) + ')', 'admin', 'adminEngineerDirectoryCard');
```

### Source line 10356

```javascript
logActivity('account', 'Engagement agreement uploaded', meta.engineerName + ' · ' + site.name, 'admin', 'docrepo-projects');
```

### Source line 10465

```javascript
logActivity('progress', 'Activity evidence submitted for QA/QC review', site.name + ' · ' + pending.stage + ' · ' + item.label + ' · ' + file.name, 'spm', 'activesites');
```

### Source line 10788

```javascript
logActivity('approval', 'Site PM confirmed phase assignment', site.name + ' · ' + r.stage + ' phase', 'spm', 'assignment');
```

### Source line 10808

```javascript
logActivity('request', 'Site PM declined phase assignment', site.name + ' · ' + stage + ' phase · needs reassignment', 'admin', 'adminIntakeLogCard');
```

### Source line 10828

```javascript
logActivity('notice', 'Your phase has started', site.name + ' · ' + nextStage, 'spm', 'assignment');
```

### Source line 10855

```javascript
logActivity('notice', 'Current phase activated', site.name + ' · ' + site.stage + ' · ' + row.spmName, 'spm', 'assignment');
```

### Source line 11151

```javascript
logActivity('request', 'Progress flagged for rework', site.name + ' · ' + site.stage + ' · "' + note + '"', 'spm', 'activesites');
```

### Source line 11161

```javascript
logActivity('progress', 'Progress update submitted — pending Office PM review', site.name + ' · ' + site.stage + ' · ' + site.pct + '%', 'opm', 'reworkqueue');
```

### Source line 11292

```javascript
logActivity('account', (currentSession.role === 'admin' ? 'Admin' : 'Office PM') + ' reassigned ' + stage + ' phase', site.name + ' · ' + (previous ? previous + ' → ' : '') + acct.name + ' — awaiting their confirmation', 'spm', 'assignment');
```

### Source line 11500

```javascript
logActivity('request', 'Update requested from Site PM', site.name + ' · Requested by ' + currentSession.name + ' — please submit your latest progress update.', 'spm', 'activesites');
```

### Source line 11591

```javascript
logActivity('approval', 'Rework approved', site.name + ' · progress adjusted to ' + site.pct + '%', 'opm', 'reworkqueue');
```

### Source line 11615

```javascript
logActivity('request', 'Rework flag declined', site.name + ' · progress % unchanged', 'opm', 'reworkqueue');
```

### Source line 11677

```javascript
if (typeof logActivity === 'function') logActivity('account','Client account activated after project setup — ' + clientAcct.name, clientAcct.email + ' · access enabled for ' + projectName,'admin','adminAccountsCard');
```

### Source line 11730

```javascript
logActivity('approval', 'Project activated', site.name + ' · Mobilization is now the active project phase', 'admin', 'activesites');
```

## CSS interaction and responsive inventory

CSS is not a visual template. Original style block lines 11–1078. These references identify behavior/state selectors and media conditions, not appearance to copy.

- Line 98: `.nav-item.nav-parent{ justify-content:space-between; }`
- Line 100: `.nav-item.nav-parent.expanded .nav-chevron{ transform:rotate(90deg); }`
- Line 101: `.nav-children{ margin-bottom:2px; }`
- Line 102: `.nav-children .nav-item{ padding-left:26px; font-size:13px; }`
- Line 150: `.notif-panel.open{ display:flex; }`
- Line 189: `.activity-overlay.open{ display:block; }`
- Line 195: `.activity-drawer.open{ right:0; }`
- Line 293: `@media (max-width:640px){ .pd-personnel-grid{ grid-template-columns:1fr; } }`
- Line 302: `.view{ display:none; }`
- Line 303: `.view.active{ display:block; }`
- Line 304: `.role-section-hidden{ display:none !important; }`
- Line 323: `@media (max-width:980px){ .grid-2{ grid-template-columns:1fr; } }`
- Line 391: `@media(max-width:900px){.intake-modal-overlay{padding:10px}.intake-modal{max-height:96vh}.intake-modal-body{padding:14px}.intake-modal-body .grid-2{display:block}.intake-modal-body .grid-2>.card{margin-bottom:16px}.intake-launch-card .card-body{align-items:flex-start;flex-direction:column;}}`
- Line 403: `.btn:disabled{ opacity:0.55; cursor:not-allowed; }`
- Line 497: `.modal-overlay.open{ display:flex; }`
- Line 664: `.archive-tab-btn.active{ background:var(--paper); border-color:var(--line); border-bottom-color:var(--paper); color:var(--ink-navy); font-weight:600; margin-bottom:-1px; }`
- Line 665: `.archive-panel{ display:none; }`
- Line 666: `.archive-panel.active{ display:block; }`
- Line 676: `@media (max-width:980px){ .sched-grid{ grid-template-columns:1fr; } }`
- Line 696: `@media (max-width:980px){ .module-grid{ grid-template-columns:repeat(2,1fr); } }`
- Line 708: `.archive-tab-btn.active .archive-tab-count{ background:rgba(58,110,165,0.14); color:var(--blueprint); }`
- Line 709: `.archive-panel table tbody tr{ transition:background 0.12s ease; }`
- Line 710: `.archive-panel table tbody tr:hover{ background:rgba(20,33,61,0.025); }`
- Line 823: `@media (min-width: 900px){`
- Line 826: `.sd-directory-grid .sd-company-card.is-open{ grid-column:1 / -1; }`
- Line 898: `.checklist-upload-confirm-backdrop.is-open{display:flex;}`
- Line 943: `.document-upload-confirm-backdrop.is-open{display:flex;}`
- Line 1065: `@media (max-width:760px){`
- Line 1077: `@media(max-width:760px){.acct-filter-chip{height:30px;padding:5px 9px;font-size:11px}}`

## Static extraction counts

- Named function declarations: 416.
- HTML controls/surfaces indexed: 260.
- Counts are source coverage aids, not counts of complete modules or working interactions.
