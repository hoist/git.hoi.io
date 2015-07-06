FROM iojs:1.8

# add our user and group first to make sure their IDs get assigned consistently, regardless of whatever dependencies get added
RUN addgroup --gid 1001 hoist && adduser --system --uid 1003 --ingroup hoist --disabled-password hoist && usermod -a -G staff hoist && chown -R root:staff /usr/local/

#create and set the working directory
RUN mkdir -p /usr/src/app && mkdir /home/hoist/.npm

#copy npmrc to enable login to private npm
COPY .npmrc /home/hoist/.npmrc

#sort out permissions
RUN chown hoist:hoist /home/hoist/.npmrc && chown -R hoist:hoist /home/hoist/.npm && chown -R hoist:hoist /usr/src/app

VOLUME /home/hoist/.npm

USER hoist

WORKDIR /usr/src/app

#only show warnings for npm
ENV NPM_CONFIG_LOGLEVEL=warn

#install global packages
RUN npm install -g nodemon && npm install -g babel && npm install -g gulp

ADD package.json /usr/src/app/package.json
RUN npm install

#ensure nodemon doesn't create heapdumps
ENV NODE_HEAPDUMP_OPTIONS=nosignal

#add source and ensure it's owned by the hoist user
USER root
ADD . /usr/src/app
RUN chown -R hoist:hoist /usr/src/app
USER hoist

EXPOSE 8000

ENTRYPOINT ["nodemon", "--exitcrash","--watch", "/config", "--exec"]

CMD [ "./scripts/start.sh"]
