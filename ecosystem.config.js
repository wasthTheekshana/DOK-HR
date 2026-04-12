module.exports = {
  apps: [{
    name: 'dok-hr-api',
    script: 'src/server.ts',
    interpreter: 'node',
    interpreter_args: '-r ts-node/register',
    cwd: '/home/dokHr/DOK-HR/server',
    env: {
      NODE_ENV: 'production',
      LD_LIBRARY_PATH: '/opt/oracle/product/21c/dbhomeXE/lib',
      ORACLE_HOME: '/opt/oracle/product/21c/dbhomeXE'
    },
    error_file: '/var/log/dok-hr/error.log',
    out_file: '/var/log/dok-hr/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
