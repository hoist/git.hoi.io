FROM hoist/core-box:latest

USER root
#copy npmrc to enable login to private npm
COPY .npmrc /home/hoist/.npmrc

RUN chown hoist:hoist /home/hoist/.npmrc

USER hoist

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
EXPOSE 28692

ENTRYPOINT ["nodemon", "--exitcrash","--watch", "/config", "--exec"]

CMD [ "./scripts/start.sh"]
