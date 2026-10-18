import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AccessLinkInvalid } from '../../domain/accessLink/accessLinkErrors.js';
import type {
  AcceptedInvitation,
  AccessLinkRepository,
} from '../../domain/accessLink/accessLinkRepository.js';
import { TooManyAttempts } from '../../domain/attempts/tooManyAttempts.js';
import { PRIVACY_POLICY_VERSION } from '../../domain/privacy/privacyPolicy.js';
import { EmailAlreadyRegistered } from '../../domain/registration/registrationErrors.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { AttemptLimiter } from '../attempts/attemptLimiter.js';
import type { PasswordHasher } from '../credentials/passwordHasher.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import type { IdGenerator } from '../registration/idGenerator.js';
import type { SecretTokenGenerator } from '../tokens/secretTokenGenerator.js';
import { ValidationError } from '../validationError.js';
import { AcceptInvitation } from './acceptInvitation.js';

const NOW = new Date('2026-10-18T10:00:00Z');
const CONTEXT = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (test)' };
const TOKEN = 'token-del-enlace';
const TOKEN_HASH = 'a'.repeat(64);
const PASSWORD = 'Secreta123!';
const PASSWORD_HASH = '$2b$12$'.padEnd(60, 'h');
const validBody = {
  token: TOKEN,
  firstName: ' Ana ',
  lastName: 'Pérez-Gil',
  email: '  Ana.Perez@Example.COM ',
  password: PASSWORD,
  privacyPolicyAccepted: true,
};
const ACCEPTED: AcceptedInvitation = {
  invitationId: 'invitation-1',
  user: {
    id: 'user-1',
    firstName: 'Ana',
    lastName: 'Pérez-Gil',
    email: 'ana.perez@example.com',
    role: 'MEMBER',
  },
  school: { id: 'school-1', name: 'CEIP Lluís Vives' },
};

describe('AcceptInvitation', () => {
  let calls: string[];
  let consume: Mock<AttemptLimiter['consume']>;
  let release: Mock<AttemptLimiter['release']>;
  let hashToken: Mock<SecretTokenGenerator['hash']>;
  let findPendingInvitation: Mock<AccessLinkRepository['findPendingInvitation']>;
  let acceptInvitationInRepository: Mock<AccessLinkRepository['acceptInvitation']>;
  let hashPassword: Mock<PasswordHasher['hash']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let acceptInvitation: AcceptInvitation;

  beforeEach(() => {
    calls = [];
    consume = vi.fn<AttemptLimiter['consume']>().mockImplementation(() => {
      calls.push('consume');
      return Promise.resolve('attempt-1');
    });
    release = vi.fn<AttemptLimiter['release']>().mockImplementation(() => {
      calls.push('release');
      return Promise.resolve();
    });
    hashToken = vi.fn<SecretTokenGenerator['hash']>().mockReturnValue(TOKEN_HASH);
    findPendingInvitation = vi
      .fn<AccessLinkRepository['findPendingInvitation']>()
      .mockImplementation(() => {
        calls.push('find');
        return Promise.resolve({ schoolName: 'CEIP Lluís Vives', role: 'MEMBER' });
      });
    acceptInvitationInRepository = vi
      .fn<AccessLinkRepository['acceptInvitation']>()
      .mockImplementation(() => {
        calls.push('accept');
        return Promise.resolve(ACCEPTED);
      });
    hashPassword = vi.fn<PasswordHasher['hash']>().mockImplementation(() => {
      calls.push('hash-password');
      return Promise.resolve(PASSWORD_HASH);
    });
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    const idGenerator: IdGenerator = { generate: () => 'new-user-id' };
    acceptInvitation = new AcceptInvitation({
      attemptLimiter: { consume, release },
      accessLinkRepository: {
        findPendingInvitation,
        acceptInvitation: acceptInvitationInRepository,
      },
      secretTokenGenerator: { hash: hashToken },
      passwordHasher: { hash: hashPassword },
      idGenerator,
      now: () => NOW,
      logger: { info, warn },
    });
  });

  const run = (body: unknown = validBody) => acceptInvitation.execute({ body, context: CONTEXT });

  it('follows the order limit, link, fields, password hash and registration', async () => {
    await run();

    expect(calls).toEqual(['consume', 'find', 'hash-password', 'accept', 'release']);
  });

  it('returns the user and the school created', async () => {
    expect(await run()).toEqual(ACCEPTED);
  });

  it('registers the normalized fields with the hashed password, the id and the consent', async () => {
    await run();

    expect(acceptInvitationInRepository).toHaveBeenCalledExactlyOnceWith({
      tokenHash: TOKEN_HASH,
      now: NOW,
      newUser: {
        id: 'new-user-id',
        firstName: 'Ana',
        lastName: 'Pérez-Gil',
        email: 'ana.perez@example.com',
        passwordHash: PASSWORD_HASH,
        privacyPolicyAcceptedAt: NOW,
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      },
    });
    expect(hashPassword).toHaveBeenCalledWith(PASSWORD);
  });

  it('never takes the role or the school from the body', async () => {
    await run({ ...validBody, role: 'ADMIN', schoolId: 'other-school' });

    const { newUser } = acceptInvitationInRepository.mock.calls[0]![0];
    expect(newUser).not.toHaveProperty('role');
    expect(newUser).not.toHaveProperty('schoolId');
  });

  it('counts the attempt under the invitation key of the client ip', async () => {
    await run();

    expect(consume).toHaveBeenCalledWith('invitation:203.0.113.7');
  });

  it('releases the attempt after a registration, because only invalid links count', async () => {
    await run();

    expect(release).toHaveBeenCalledExactlyOnceWith('attempt-1');
  });

  it('logs INVITATION_ACCEPTED with the school, the invitation data, the user and the role', async () => {
    await run();

    expect(info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'INVITATION_ACCEPTED',
        school_id: 'school-1',
        invitation_id: 'invitation-1',
        user_id: 'user-1',
        role: 'MEMBER',
      },
      expect.any(String),
    );
  });

  describe('when the link is not valid', () => {
    it('throws AccessLinkInvalid before validating the fields or hashing the password', async () => {
      findPendingInvitation.mockResolvedValueOnce(null);

      const error: unknown = await run({ ...validBody, firstName: '', email: 'nope' }).catch(
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(AccessLinkInvalid);
      expect((error as AccessLinkInvalid).reason).toBe('NOT_PENDING');
      expect(hashPassword).not.toHaveBeenCalled();
      expect(acceptInvitationInRepository).not.toHaveBeenCalled();
    });

    it('keeps the attempt counted and logs INVITATION_ACCEPT_REJECTED with LINK_INVALID', async () => {
      findPendingInvitation.mockResolvedValueOnce(null);

      await run().catch(() => undefined);

      expect(release).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'INVITATION_ACCEPT_REJECTED',
          reason: 'LINK_INVALID',
          ip: '203.0.113.7',
        }),
        expect.any(String),
      );
    });

    it.each([[{ ...validBody, token: undefined }], [{ ...validBody, token: '' }], [null]])(
      'throws AccessLinkInvalid when the token is missing (%j)',
      async (body) => {
        const error: unknown = await run(body).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(AccessLinkInvalid);
        expect((error as AccessLinkInvalid).reason).toBe('TOKEN_MISSING');
        expect(findPendingInvitation).not.toHaveBeenCalled();
      },
    );

    it('throws AccessLinkInvalid when the link stops being pending before the registration', async () => {
      acceptInvitationInRepository.mockResolvedValueOnce(null);

      const error: unknown = await run().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AccessLinkInvalid);
      expect(release).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'INVITATION_ACCEPT_REJECTED', reason: 'LINK_INVALID' }),
        expect.any(String),
      );
      expect(info).not.toHaveBeenCalled();
    });
  });

  describe('when the fields are not valid', () => {
    it('throws ValidationError with a detail per field and releases the attempt', async () => {
      const error: unknown = await run({
        ...validBody,
        firstName: '',
        privacyPolicyAccepted: false,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details).toEqual([
        { field: 'firstName', code: 'REQUIRED' },
        { field: 'privacyPolicyAccepted', code: 'REQUIRED' },
      ]);
      expect(release).toHaveBeenCalledExactlyOnceWith('attempt-1');
      expect(hashPassword).not.toHaveBeenCalled();
      expect(acceptInvitationInRepository).not.toHaveBeenCalled();
    });
  });

  describe('when the email is already registered', () => {
    beforeEach(() => {
      acceptInvitationInRepository.mockRejectedValueOnce(new EmailAlreadyRegistered());
    });

    it('rethrows EmailAlreadyRegistered and releases the attempt', async () => {
      await expect(run()).rejects.toBeInstanceOf(EmailAlreadyRegistered);

      expect(release).toHaveBeenCalledExactlyOnceWith('attempt-1');
    });

    it('logs INVITATION_ACCEPT_REJECTED with the masked email', async () => {
      await run().catch(() => undefined);

      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'INVITATION_ACCEPT_REJECTED',
          reason: 'EMAIL_ALREADY_REGISTERED',
          email: 'a***@example.com',
        }),
        expect.any(String),
      );
      expect(info).not.toHaveBeenCalled();
    });
  });

  describe('failures of the infrastructure', () => {
    it('propagates TooManyAttempts without looking the link up, and logs the rate limit', async () => {
      consume.mockRejectedValueOnce(new TooManyAttempts(300));

      await expect(run()).rejects.toBeInstanceOf(TooManyAttempts);

      expect(findPendingInvitation).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'INVITATION_RATE_LIMITED', retry_after: 300 }),
        expect.any(String),
      );
    });

    it('propagates DatabaseUnavailable from the lookup and from the registration', async () => {
      findPendingInvitation.mockRejectedValueOnce(new DatabaseUnavailable(new Error('x')));
      await expect(run()).rejects.toBeInstanceOf(DatabaseUnavailable);

      acceptInvitationInRepository.mockRejectedValueOnce(new DatabaseUnavailable(new Error('x')));
      await expect(run()).rejects.toBeInstanceOf(DatabaseUnavailable);
    });

    it('still answers when releasing the attempt fails, and logs it', async () => {
      release.mockRejectedValueOnce(new DatabaseUnavailable(new Error('x')));

      expect(await run()).toEqual(ACCEPTED);
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'INVITATION_ATTEMPT_RELEASE_FAILED' }),
        expect.any(String),
      );
    });
  });

  it('never logs the token, its hash, the password or its hash', async () => {
    await run();
    findPendingInvitation.mockResolvedValueOnce(null);
    await run().catch(() => undefined);
    acceptInvitationInRepository.mockRejectedValueOnce(new EmailAlreadyRegistered());
    await run().catch(() => undefined);

    const logged = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
    for (const secret of [TOKEN, TOKEN_HASH, PASSWORD, PASSWORD_HASH]) {
      expect(logged).not.toContain(secret);
    }
  });
});
