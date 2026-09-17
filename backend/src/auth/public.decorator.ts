import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'mailer:isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
