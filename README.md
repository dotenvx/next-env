# @dotenvx/next-env

`@dotenvx/next-env` is a drop-in replacement for Next.js' `@next/env` package.

Use it when you want Next.js to load encrypted dotenvx files during Next's own environment-loading step. This lets decrypted values exist before Next.js evaluates server modules.

```json
{
  "dependencies": {
    "@dotenvx/next-env": "^2.0.0",
    "next": "^16.0.0"
  },
  "overrides": {
    "@next/env": "npm:@dotenvx/next-env"
  }
}
```

After installing, run Next.js normally:

```sh
npm run dev
npm run build
```


## Third Party Notices

This package bundles portions of `@dotenvx/primitives`, which bundles portions of the following MIT-licensed packages:

- `eciesjs`
- `@ecies/ciphers`
- `@noble/curves`
- `@noble/hashes`
- `@noble/ciphers`

### eciesjs

MIT License

Copyright (c) 2019-2026 Weiliang Li

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### @ecies/ciphers

MIT License

Copyright (c) 2019-2026 Weiliang Li

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### @noble/curves and @noble/hashes

The MIT License (MIT)

Copyright (c) 2022 Paul Miller (https://paulmillr.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the “Software”), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

### @noble/ciphers

The MIT License (MIT)

Copyright (c) 2022 Paul Miller (https://paulmillr.com)
Copyright (c) 2016 Thomas Pornin <pornin@bolet.org>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the “Software”), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## Envfile

`loadEnvConfig(dir, ...)` automatically reads `Envfile` in the project directory
(`Envspec` and `Dotenvspec` remain fallback aliases). It uses the shared
`@dotenvx/primitives` policy engine after merging Next's selected dotenv layers
and existing environment values.

```ruby
strict true

env "DATABASE_URL", type: "url"
env "PORT", type: "port", encrypted: false, redacted: false
```

Declarations are required, encrypted, and redacted by default. Required values,
types, enums, ranges, and encrypted origins follow the same rules as dotenvx
`run` and `check`. File blocks apply to the selected Next environment's paths;
they do not add files to the load order. Plaintext shell overrides of encrypted
file values do not count as encrypted sources. Private keys are read from the
project's `.env.keys` and each selected file's `.keys` companion, plus the existing
environment.

Validation warns through the supplied logger's `error` method by default.
`strict true`, at the root or in an applicable file block, throws before new values
are injected. Invalid syntax always throws. Diagnostics contain variable names
and rules, never resolved values. Application logging and returned values are
not masked.

Envfile is re-read on cache hits, so policy edits, removal, and malformed
replacements take effect without restarting. Dotenv content changes still use
Next's `forceReload` mechanism. Projects without a policy retain their normal
file selection and shell precedence.

Run `npm test` and `npm run build` to verify the integration.
