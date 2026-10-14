# Permission Boundary Harness
Mode: CORE

## Generally safe
Inspect, search, read, run non-destructive tests/builds, edit within agreed scope, create local commits when workflow allows.

## Remote/side-effect actions
Push, open/update PR, mutate cloud configuration, deploy, merge, delete remote branches.

These must follow the user's established workflow and current authorization.

## High-risk / explicit approval
Force-push protected branches, destructive migration, secret rotation, production data deletion, billing changes, disabling security controls, destructive infrastructure operations.
