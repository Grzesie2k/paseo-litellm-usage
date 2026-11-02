# paseo-litellm-usage

A [Paseo](https://paseo.sh) usage source that shows your [LiteLLM](https://docs.litellm.ai) proxy budget in the Usage panel.

For every [OpenCode](https://opencode.ai) provider that has a login in `auth.json` and points at a LiteLLM proxy, it calls `GET /user/info` and shows:

- budget window: spend vs. `max_budget`, with the reset date from `budget_reset_at`
- balance in USD: spent, remaining, limit

Providers whose gateway does not answer `/user/info` like LiteLLM are skipped.

## Install

```sh
git clone https://github.com/Grzesie2k/paseo-litellm-usage
cd paseo-litellm-usage && npm install
paseo plugin install "$PWD"
```

Requires Paseo `>=0.9.2`.

## Configuration

Base URLs are taken from `provider.<id>.options.baseURL` in `~/.config/opencode/opencode.jsonc`.

If a provider gets its URL some other way (e.g. from an auth plugin), add it to `~/.config/litellm-usage/config.json`:

```json
{
  "providers": {
    "my-provider": { "name": "My LiteLLM", "baseUrl": "https://litellm.example.com" }
  }
}
```

`name` is the account label shown in the panel and is optional; a plain string value is read as the base URL. Entries in this file override `opencode.jsonc`.

API keys are read from OpenCode's `auth.json` (`~/.local/share/opencode/auth.json`) at request time and are only sent to the provider's own gateway.

## Development

```sh
npm install
npm run typecheck
```

## License

MIT
