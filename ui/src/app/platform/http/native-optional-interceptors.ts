import { HttpInterceptorFn } from '@angular/common/http';
import { nativeIntelligenceInterceptor } from './native-intelligence-http';
import { nativePublishingInterceptor } from './native-publishing-http';
import { nativeSocialInterceptor } from './native-social-http';
export const intercept: HttpInterceptorFn = (request, next) =>
  nativeIntelligenceInterceptor(request, (r) =>
    nativePublishingInterceptor(r, (s) => nativeSocialInterceptor(s, next)),
  );
