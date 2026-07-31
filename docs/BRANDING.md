# Company branding

Branding is configuration, not a code fork.

## Initial setup

`bash nfrp setup` accepts company name, product name, subtitle, palette and an optional local logo file. The logo is copied into an ignored directory and imported into the application upload volume on first seed. Because it is public interface content rather than a secret, setup gives the copied file read permissions for the unprivileged application container while keeping `.env` private.

## Runtime changes

An authenticated administrator can use **Settings → Company identity** to update the same values. Supported logos are PNG, JPG and WebP up to 2 MB. The server validates both MIME type and file signature.

## Storage boundary

Text and colors are stored in `AppSetting`. The logo is stored under the application upload volume and served through a narrow public image endpoint because it must also appear on the login page.

The repository itself contains no company logo or branding asset except synthetic defaults.
