const ldap = require('ldapjs');

const LDAP_CONFIG = {
  url: process.env.LDAP_URL || 'ldap://p5asldapdns01.tuntun.co.id:389',
  bindDN: process.env.LDAP_BIND_DN || 'CN=bind sssd,CN=Users,DC=tuntun,DC=co,DC=id',
  bindPassword: process.env.LDAP_BIND_PASSWORD || '',
  searchBase: process.env.LDAP_SEARCH_BASE || 'OU=User-Internal,DC=tuntun,DC=co,DC=id',
  usernameAttribute: process.env.LDAP_USERNAME_ATTRIBUTE || 'sAMAccountName',
  searchFilter: process.env.LDAP_SEARCH_FILTER || '(&(objectClass=user)(sAMAccountName=%s))'
};

class LDAPService {
  constructor() {
    this.config = LDAP_CONFIG;
  }

  createClient() {
    const opts = { url: this.config.url, reconnect: true };
    if (this.config.url.startsWith('ldaps')) {
      opts.tlsOptions = { rejectUnauthorized: false };
    }
    return ldap.createClient(opts);
  }

  async authenticate(username, password) {
    return new Promise((resolve, reject) => {
      const client = this.createClient();

      console.log('[LDAP] Authenticating:', username);

      client.bind(this.config.bindDN, this.config.bindPassword, (err) => {
        if (err) {
          client.destroy();
          return reject(new Error('LDAP bind failed: ' + err.message));
        }

        const searchFilter = this.config.searchFilter.replace('%s', username);

        client.search(this.config.searchBase, {
          filter: searchFilter,
          scope: 'sub',
          attributes: ['dn', 'cn', 'email', 'mail', 'uid', 'displayName', 'sAMAccountName']
        }, (err, res) => {
          if (err) {
            client.destroy();
            return reject(new Error('LDAP search failed: ' + err.message));
          }

          let userEntry = null;

          res.on('searchEntry', (entry) => {
            userEntry = entry;
          });

          res.on('error', (err) => {
            client.destroy();
            return reject(new Error('LDAP search error: ' + err.message));
          });

          res.on('end', () => {
            if (!userEntry) {
              client.destroy();
              return reject(new Error('User not found'));
            }

            const userDN = userEntry.dn.toString();
            const userInfo = this.extractUserInfo(userEntry);

            client.bind(userDN, password, (err) => {
              client.destroy();

              if (err) {
                return reject(new Error('Invalid credentials'));
              }

              resolve({
                username: userInfo.sAMAccountName || userInfo.uid || username,
                dn: userDN,
                email: userInfo.email || userInfo.mail || '',
                fullName: userInfo.cn || userInfo.displayName || username
              });
            });
          });
        });
      });

      client.on('error', (err) => {
        reject(new Error('LDAP connection error: ' + err.message));
      });

      setTimeout(() => {
        client.destroy();
        reject(new Error('LDAP connection timeout'));
      }, 10000);
    });
  }

  extractUserInfo(entry) {
    const info = {};
    if (entry.pojo && entry.pojo.attributes) {
      entry.pojo.attributes.forEach(attr => {
        info[attr.type] = attr.values[0];
      });
    }
    return info;
  }
}

module.exports = new LDAPService();
