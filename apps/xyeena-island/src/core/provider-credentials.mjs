// In-memory, session-only credential store scoped per provider.
// Never persists to localStorage, sessionStorage, or disk.
// Never logged, exported, or echoed in UI.

class ProviderCredentialStore {
  /** @type {Map<string, string>} */
  #keys = new Map();

  /**
   * Set API key for a cloud provider.
   * Local providers (ollama, lmstudio) are rejected.
   * @param {string} providerId
   * @param {string} key
   * @returns {boolean}
   */
  setKey(providerId, key) {
    if (!providerId || typeof providerId !== 'string') return false;
    const pid = providerId.toLowerCase();
    // Local providers must never store or receive cloud credentials
    if (pid === 'ollama' || pid === 'lmstudio') return false;
    const trimmed = (key || '').trim();
    if (!trimmed) {
      this.#keys.delete(pid);
      return false;
    }
    this.#keys.set(pid, trimmed);
    return true;
  }

  /**
   * Get API key for a specific provider.
   * Never returns keys for other providers.
   * Returns empty string for local providers or unset keys.
   * @param {string} providerId
   * @returns {string}
   */
  getKey(providerId) {
    if (!providerId || typeof providerId !== 'string') return '';
    const pid = providerId.toLowerCase();
    if (pid === 'ollama' || pid === 'lmstudio') return '';
    return this.#keys.get(pid) || '';
  }

  /**
   * Check if a provider has an in-memory key configured.
   * @param {string} providerId
   * @returns {boolean}
   */
  hasKey(providerId) {
    return Boolean(this.getKey(providerId));
  }

  /**
   * Clear API key for a specific provider, or all keys if no provider is passed.
   * @param {string} [providerId]
   */
  clearKey(providerId) {
    if (providerId) {
      this.#keys.delete(providerId.toLowerCase());
    } else {
      this.#keys.clear();
    }
  }
}

export const providerCredentials = new ProviderCredentialStore();
export { ProviderCredentialStore };
