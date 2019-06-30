package com.naijagov.naijagov.repository;

import com.naijagov.naijagov.model.PollingCentre;

import org.springframework.data.repository.CrudRepository;
import org.springframework.data.rest.core.annotation.RestResource;
import org.springframework.stereotype.Repository;

@Repository("pollingCentreRepository")
public interface PollingCentreRepository extends CrudRepository<PollingCentre, Integer>{
    // Prevents POST /pollingUnit and PATCH /pollingUnit/:id
    @Override
    @RestResource(exported = false)
    public PollingCentre save(PollingCentre p);

    // Prevents DELETE /pollingUnit/:id
    @Override
    @RestResource(exported = false)
    public void delete(PollingCentre p);
}
