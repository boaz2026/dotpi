# .π

<p align="center">
  <img
    src="assets/dotpi.png"
    alt="Nix Development Shells"
    width="350"
    height="350"
  >
</p>

My configuration repository for **Pi**, containing extensions, agents, prompts, and other customizations.

The goal of this repository is to keep my Pi setup version-controlled, reproducible, and easy to share across machines.

## Structure

```text
dotpi/
├── extensions/     # Pi extensions
├── themes/         # Pi themes
├── skills/         # Reusable skills
└── README.md
```

The structure may evolve as new types of configuration are added.

## Installation

Clone the repository:

```bash
git clone <repo-url>
cd dotpi
```

Then link or copy the relevant configuration into your Pi configuration directory.

For example:

```bash
ln -s "$(pwd)/extensions" ~/.pi/agent/extensions
```

Adjust paths depending on your Pi setup.

## Extensions

Custom extensions live under:

```text
extensions/
```

Each extension should ideally be self-contained and include any documentation or configuration required to use it.

## Agents

Agent definitions live under:

```text
agents/
```

Agents can contain specialized instructions, tools, prompts, or workflows for particular tasks.

## Philosophy

This repository aims to keep Pi customization:

* **Version controlled** — changes are easy to track and revert.
* **Portable** — the same setup can be used across machines.
* **Modular** — extensions and agents should remain independent where possible.
* **Discoverable** — configurations should be understandable without digging through unrelated files.

## Usage

Feel free to use, modify, or borrow anything useful from this repository.

Some configurations may be tailored specifically to my workflow, so review them before using them in your own environment.

## License

MIT.

