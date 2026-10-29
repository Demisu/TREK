/**
 * The sample dialect beside this file is the issuer's own test output, kept
 * byte for byte, and imports its types from next to itself the way a real
 * dialect does in src/nest/service-identity/. This points that import at the
 * real types, so the sample is typechecked and linted against them.
 */
export type {
  DialectSelfCheck,
  RegistrationDialect,
} from '../../../src/nest/service-identity/registration-dialect.types';
