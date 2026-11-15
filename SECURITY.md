# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration holds no secret: the Alplakes API is public and keyless. It
stores under `/data` (`alplakes.json`) the list of lakes, the last model
series of the followed lakes and points, and the side of each trigger
threshold. It only talks to Gladys and, over HTTPS, to
`alplakes-api.eawag.ch` and to the static lake list of the Alplakes website
(`alplakes-eawag.s3.eu-central-1.amazonaws.com`): they receive the lake keys,
the depth and the coordinates of the configured points, nothing else.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the third-party services the integration talks to.
