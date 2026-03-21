pipeline {
    agent any

    tools {
        nodejs 'NodeJS-20'
    }

    environment {
        APP_DIR    = '/home/dokHr/DOK-HR'
        SERVER_DIR = '/home/dokHr/DOK-HR/server'
        CLIENT_DIR = '/home/dokHr/DOK-HR/client'
        PM2_APP    = 'dok-hr-api'
    }

    stages {

        stage('Checkout') {
            steps {
                echo 'Pulling latest code from GitHub...'
                git branch: 'main',
                    credentialsId: 'github-credentials',
                    url: 'https://github.com/wasthTheekshana/DOK-HR.git'
            }
        }

        stage('Install Server Dependencies') {
            steps {
                echo 'Installing server dependencies...'
                dir('server') {
                    sh 'npm install'
                }
            }
        }

        stage('Install Client Dependencies') {
            steps {
                echo 'Installing client dependencies...'
                dir('client') {
                    sh 'npm install'
                }
            }
        }

        stage('Build Frontend') {
            steps {
                echo 'Building React frontend...'
                dir('client') {
                    sh 'npm run build'
                }
            }
        }

        stage('Deploy to Server') {
            steps {
                echo 'Copying built files to deployment directory...'
                sh '''
                    # Copy server files
                    rsync -av --exclude='node_modules' --exclude='.env' \
                        server/ ${SERVER_DIR}/

                    # Copy built client
                    rsync -av client/dist/ ${CLIENT_DIR}/dist/

                    # Install server production dependencies on deploy path
                    cd ${SERVER_DIR} && npm install --omit=dev
                '''
            }
        }

        stage('Reload Application') {
            steps {
                echo 'Reloading PM2 application...'
                sh '''
                    export PATH="$PATH:/usr/local/bin"
                    pm2 reload ${PM2_APP} --update-env || pm2 start ${SERVER_DIR}/ecosystem.config.js
                    pm2 save
                '''
            }
        }

        stage('Health Check') {
            steps {
                echo 'Checking application health...'
                sh '''
                    sleep 5
                    curl -f http://localhost:5001/health || exit 1
                    echo "Health check passed!"
                '''
            }
        }
    }

    post {
        success {
            echo '✅ Deployment successful! DOK-HR is live.'
        }
        failure {
            echo '❌ Deployment failed. Check the logs above.'
        }
    }
}