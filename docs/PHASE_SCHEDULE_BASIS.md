# Construction phase planning draft: basis and limits

The system divides the OPM-reviewed project period among required phases. It
does **not** estimate absolute construction time from floor area or claim that
the resulting dates are 10 Builders' historical production rates. The OPM
reviews and changes the dates before staffing.

The relative weights for site preparation (120), foundation (150), framing
(200), roofing (80), electrical/plumbing (100), and finishes (140) come from
the process-hour comparison in Table 1 of *Research of Technological Processes
of Construction of Low-Rise Residential Buildings by the Method of Time
Measurements*:
https://7universum.com/en/tech/archive/item/22390

The app maps those six process categories to Mobilization, Foundation,
Structure, Envelope, MEP Rough-In, and Finishes. The table reports **hours for
observed low-rise residential work**, not universal days for broad phases.
Using its ratios for commercial and mixed-use is a generic planning assumption,
not a direct empirical result. The remaining weights (Design 120, Fire & Life
Safety 100, Landscape/Site Works 80, Closeout 40, and unmapped phases 100) are
explicit placeholders pending company data or a project-specific estimate.

Algorithm: apply the selected phase arrangement and dependencies; find the
largest common multiplier for the relative weights whose resulting schedule
fits within the reviewed start and completion dates; enforce 14 calendar days
for every phase. If even the minimum schedule exceeds the reviewed completion
date, the UI flags the conflict. OPM changes are validated against the project
window and dependencies before staffing.

For a detailed construction baseline, estimate each activity from quantities,
crew productivity and availability, then sequence the activities. This method
is described in Carnegie Mellon's *Project Management for Construction*:
https://www.cmu.edu/cee/projects/PMbook/09_Construction_Planning.html

The 14-day minimum is a project validation rule requested for this application,
not a general construction scheduling standard.
