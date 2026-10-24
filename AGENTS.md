# AirPodsBattery — project rules

These rules apply throughout this repository. Keep this file in English and
focused on enduring project requirements, rather than individual UI cases or
temporary task status.

1. **Purpose and compatibility.** Maintain a small Android app built with React
   Native for checking Apple AirPods battery information on demand. Aim to support
   AirPods across generations through shared, extensible handling, without tying
   the app to one owner's phone or pair. Be explicit about unverified or
   unsupported capabilities.

2. **Security first.** Security is the highest priority. Keep the attack surface
   small and do not weaken protection for convenience, compatibility, or size.
   Assess security consequences when changing dependencies, permissions, native
   code, or build configuration.

3. **Minimum permissions.** Request only permissions required by the current
   feature on the running Android version, and only when needed. Modern Android
   must work without location permission or enabled location services. Retain
   legacy location requirements only where Android requires them for Bluetooth
   scanning; do not collect coordinates.

4. **Independent operation.** The installed release app must work entirely
   offline, without an internet permission, server, cloud service, account, or
   connected computer. Development and build tools may use the internet; that
   must not introduce a runtime dependency.

5. **Privacy and data handling.** Do not add analytics, advertising, remote code
   loading, or unnecessary data collection. Treat Bluetooth input as untrusted:
   validate lengths, formats, and values, and bound processing and storage.
   Avoid retaining or logging raw device data and identifiers without a concrete
   need. Display only information justified by the received data; do not invent
   accuracy or measurements.

6. **Signing and secrets.** Use a private release signing key. Keep signing keys,
   passwords, tokens, and credentials outside Git and logs. Preserve existing
   signing material for updates; never silently replace it or fall back to a
   publicly known debug key. Moving development to another computer must not
   silently change the release identity.

7. **No background work.** Start Bluetooth work only after an explicit user
   action while the app is active. Do not add background scanning, monitoring,
   scheduled jobs, automatic startup, or persistent services. Cancel active work
   when the app leaves the foreground or its owning screen is destroyed.

8. **Bounded resource use.** Minimize CPU, memory, battery use, and APK size.
   Bound scans and other expensive operations, stop early once their required
   result is available, and release timers, callbacks, and other resources on
   completion, cancellation, timeout, and failure. Avoid duplicate operations,
   unnecessary processing, and idle polling.

9. **Simple design.** Keep both the interface and implementation focused on the
   app's purpose. Avoid unnecessary settings, explanations, debug clutter,
   abstractions, and unrelated features. Prefer clear, maintainable code over
   complexity that has no demonstrated benefit.

10. **Small dependency footprint.** Add dependencies only for a concrete need
    that justifies their size, maintenance, and security cost. Prefer existing
    platform capabilities or a small implementation when appropriate. Keep
    development and testing tools out of the release runtime.

11. **Evidence-based implementation.** Consult documented platform behavior and
    established open-source solutions when investigating protocol or device
    compatibility. Verify assumptions instead of guessing from one device.
    Respect licenses when reusing code.

12. **Meaningful tests.** Cover important observable behavior and regressions,
    especially protocol parsing, permission boundaries, lifecycle handling,
    cancellation, and resource cleanup. Test outcomes and contracts rather than
    duplicating implementation details or relying on fragile presentation
    snapshots. Coverage percentages are not a substitute for useful assertions.

13. **Fast, deterministic tests.** Keep tests isolated and repeatable across
    machines, execution orders, and parallel runs. Reset mutable state and mocks.
    Avoid dependencies on real time, local time zones, locales, or absolute
    workstation paths. Use controlled promises and fake clocks where needed;
    do not use arbitrary sleeps or real waiting to synchronize tests.

14. **Independent tests.** After dependencies are installed, automated logic tests
    must run without a network, server, cloud service, physical phone, or real
    Bluetooth device. Isolate platform boundaries. Keep hardware and integration
    checks separate and identify their requirements. Fix flaky test causes
    instead of hiding them with retries, longer waits, or weaker assertions.

15. **Honest verification.** Run relevant tests, type checks, and lint checks for
    code changes. Report what was actually verified and any remaining limits.
    Do not present mocked or unit tests as proof of real-device compatibility or
    absolute security.

16. **Rebuildable repository.** Keep the source, necessary assets, tests, build
    configuration, and dependency lockfiles needed to develop and rebuild on
    another computer. Avoid machine-specific paths. Keep dependencies, generated
    builds, APKs, caches, logs, local settings, and secrets out of Git; transfer
    private signing material separately when preserving update compatibility.

17. **Concise README.** Limit the README to what the app is, why it exists, and
    how to build it, including essential prerequisites and signing instructions.
    Do not add debugging walkthroughs, development diaries, task progress,
    change histories, or sections explaining how to modify the app.
