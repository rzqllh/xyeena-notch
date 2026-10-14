# Deployment Budget Harness
Mode: TRIGGERED when pushes create remote builds/deployments

Vercel/remote deployment is a release checkpoint, not the primary dev loop.

Preferred:
inspect -> implement -> local tests/build/runtime -> logical commits -> consolidated push -> remote verification -> merge -> production.

Do not push to answer questions local verification can answer.
After a remote failure, diagnose/reproduce locally before another attempt.
Never bypass provider plan restrictions through account/project rotation.
